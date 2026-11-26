import 'server-only';
import { randomUUID } from 'node:crypto';
import type { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, encryptToken } from '@/lib/google';
import { candidateSchema } from '@/lib/validation';
import { insertApplication } from '@/lib/applications';
import { translateError } from '@/lib/errors';
import {
  PAGE_SIZE,
  RobotaError,
  applyToCandidate,
  inactiveState,
  robotaApplies,
  robotaLogin,
  robotaVacancies,
  type RobotaApply,
} from '@/lib/robota';

type Supa = Awaited<ReturnType<typeof createClient>>;

export const SYNC_EVERY_MIN = 15;
const MAX_IMPORTS_PER_RUN = 60;
const MAX_APPLY_PAGES = 10;

type Account = {
  id: string;
  workspace_id: string;
  label: string;
  login: string;
  password_encrypted: string;
  token_encrypted: string | null;
  token_expires_at: string | null;
  last_sync_at: string | null;
  imported_total: number;
};

export type SyncResult = { imported: number; attached: number; errors: string[]; skipped: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[«»"'’`]/g, '').replace(/\s+/g, ' ').trim();

async function tokenFor(acc: Account): Promise<string> {
  const admin = createAdminClient();
  if (acc.token_encrypted && acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now() + 10 * 60_000) {
    try {
      return decryptToken(acc.token_encrypted);
    } catch {
      /* перевипускаємо */
    }
  }
  const token = await robotaLogin(acc.login, decryptToken(acc.password_encrypted));
  await admin
    .from('job_board_accounts')
    .update({ token_encrypted: encryptToken(token), token_expires_at: new Date(Date.now() + 20 * 3600_000).toISOString() })
    .eq('id', acc.id);
  return token;
}

// Перевірка входу під час додавання кабінету
export async function checkRobotaLogin(login: string, password: string): Promise<string | null> {
  try {
    await robotaLogin(login, password);
    return null;
  } catch (e) {
    return e instanceof RobotaError ? e.message : 'Не вдалося перевірити вхід на robota.ua';
  }
}

let robotaSourceId: string | null | undefined;
async function sourceId(supabase: Supa): Promise<string | null> {
  if (robotaSourceId !== undefined) return robotaSourceId;
  const { data } = await supabase.from('sources').select('id, name');
  robotaSourceId = ((data ?? []) as { id: string; name: string }[]).find((s) => /robota/i.test(s.name))?.id ?? null;
  return robotaSourceId;
}

// Один відгук → картка кандидата (або наявна за телефоном/email) + участь у вакансії
async function importApply(
  supabase: Supa,
  apply: RobotaApply,
  vacancyId: string | null,
): Promise<{ candidateId: string; applicationId: string | null } | { error: string }> {
  const { raw, experience, months } = applyToCandidate(apply);
  raw.source_id = (await sourceId(supabase)) ?? '';
  let parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) if (i.path[0] && i.path[0] !== 'full_name') raw[String(i.path[0])] = '';
    parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Невірні дані відгуку' };
  }
  const c = parsed.data;

  let candidateId: string | null = null;
  if (c.phone || c.email) {
    const { data: dups } = await supabase.rpc('describe_duplicates', {
      p_phone: c.phone,
      p_email: c.email,
      p_linkedin: null,
      p_full_name: c.full_name,
      p_city: c.city,
      p_exclude: null,
    });
    const exact = ((dups ?? []) as { candidate_id: string; match_type: string; accessible: boolean }[]).find((d) => d.match_type === 'exact' && d.accessible);
    candidateId = exact?.candidate_id ?? null;
  }

  if (!candidateId) {
    candidateId = randomUUID();
    const { error } = await supabase.from('candidates').insert({
      id: candidateId,
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      current_position: c.current_position,
      source_id: c.source_id,
      total_experience_months: months,
      desired_salary: c.desired_salary,
      salary_currency: c.salary_currency,
      summary: c.summary,
      review_status: 'unreviewed',
    });
    if (error) return { error: translateError(error) };
    await supabase.from('consents').insert({
      candidate_id: candidateId,
      legal_basis: 'pre_contract',
      source: 'Відгук на вакансію на robota.ua',
    });
    if (experience.length) {
      await supabase.from('candidate_experience').insert(
        experience.map((e, i) => ({
          candidate_id: candidateId,
          position: e.position,
          company: e.company,
          start_date: e.start,
          end_date: e.end && e.start && e.end < e.start ? null : e.end,
          description: e.description,
          sort_order: i,
        })),
      );
    }
  }

  return { candidateId, applicationId: vacancyId ? await attach(supabase, vacancyId, candidateId) : null };
}

async function attach(supabase: Supa, vacancyId: string, candidateId: string): Promise<string | null> {
  await insertApplication(supabase, vacancyId, candidateId); // уже доданий — не помилка
  const { data } = await supabase
    .from('applications')
    .select('id')
    .eq('vacancy_id', vacancyId)
    .eq('candidate_id', candidateId)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

// Відгуки, імпортовані до того, як вакансію пов'язали, — додаємо у вакансію CRM
export async function attachPending(supabase: Supa, accountId: string, externalVacancyId: number, vacancyId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('job_board_applies')
    .select('external_id, candidate_id')
    .eq('account_id', accountId)
    .eq('external_vacancy_id', externalVacancyId)
    .is('application_id', null)
    .not('candidate_id', 'is', null)
    .limit(200);
  let n = 0;
  for (const row of (data ?? []) as { external_id: number; candidate_id: string }[]) {
    const appId = await attach(supabase, vacancyId, row.candidate_id);
    if (appId) {
      n++;
      await admin.from('job_board_applies').update({ application_id: appId }).eq('account_id', accountId).eq('external_id', row.external_id);
    }
  }
  return n;
}

async function syncAccount(supabase: Supa, acc: Account, budget: { left: number }): Promise<{ imported: number; attached: number; failed: string[] }> {
  const admin = createAdminClient();
  const token = await tokenFor(acc);
  const remote = await robotaVacancies(token);

  // Вакансії кабінету: оновлюємо список, нові — пробуємо пов'язати з вакансією CRM за назвою
  const { data: known } = await admin.from('job_board_vacancies').select('external_id, vacancy_id').eq('account_id', acc.id);
  const links = new Map(((known ?? []) as { external_id: number; vacancy_id: string | null }[]).map((r) => [Number(r.external_id), r.vacancy_id]));
  const { data: crm } = await supabase.from('vacancies').select('id, title').in('status', ['open', 'on_hold', 'draft']).is('deleted_at', null);
  const byTitle = new Map<string, string | null>();
  for (const v of (crm ?? []) as { id: string; title: string }[]) {
    const k = norm(v.title);
    byTitle.set(k, byTitle.has(k) ? null : v.id); // дві однакові назви — не вгадуємо
  }
  const now = new Date().toISOString();
  const rows = remote.map((v) => {
    const isNew = !links.has(v.id);
    const vacancyId = isNew ? (byTitle.get(norm(v.name)) ?? null) : (links.get(v.id) ?? null);
    links.set(v.id, vacancyId);
    return {
      account_id: acc.id,
      external_id: v.id,
      workspace_id: acc.workspace_id,
      name: v.name,
      state: v.state,
      city: v.city,
      vacancy_id: vacancyId,
      last_seen_at: now,
    };
  });
  if (rows.length) await admin.from('job_board_vacancies').upsert(rows, { onConflict: 'account_id,external_id' });

  let imported = 0;
  let attached = 0;
  const failed: string[] = [];
  for (const v of remote) {
    if (budget.left <= 0) break;
    if (inactiveState(v.state)) continue;
    const vacancyId = links.get(v.id) ?? null;
    for (let page = 0; page < MAX_APPLY_PAGES && budget.left > 0; page++) {
      const applies = await robotaApplies(token, v.id, page);
      if (!applies.length) break;
      const ids = applies.map((a) => Number(a.id));
      const { data: done } = await admin.from('job_board_applies').select('external_id').eq('account_id', acc.id).in('external_id', ids);
      const seen = new Set(((done ?? []) as { external_id: number }[]).map((r) => Number(r.external_id)));
      const fresh = applies.filter((a) => !seen.has(Number(a.id)));
      for (const a of fresh) {
        if (budget.left <= 0) break;
        const r = await importApply(supabase, a, vacancyId);
        if ('error' in r) {
          failed.push(`відгук «${a.name ?? a.id}» не імпортовано: ${r.error}`);
          continue; // спробуємо знову наступного разу
        }
        await admin.from('job_board_applies').insert({
          account_id: acc.id,
          external_id: Number(a.id),
          external_vacancy_id: v.id,
          workspace_id: acc.workspace_id,
          candidate_id: r.candidateId,
          application_id: r.applicationId,
        });
        imported++;
        if (r.applicationId) attached++;
        budget.left--;
      }
      // Сторінка вже вся відома — далі старіші відгуки, їх ми вже бачили
      if (fresh.length === 0 || applies.length < PAGE_SIZE) break;
    }
  }
  return { imported, attached, failed };
}

// Синхронізація всіх кабінетів поточного простору.
// force=false — лише якщо з минулого разу минуло SYNC_EVERY_MIN хвилин (і не запущено паралельно).
export async function syncJobBoards(supabase: Supa, workspaceId: string, opts: { force?: boolean; accountId?: string } = {}): Promise<SyncResult> {
  const admin = createAdminClient();
  let q = admin
    .from('job_board_accounts')
    .select('id, workspace_id, label, login, password_encrypted, token_encrypted, token_expires_at, last_sync_at, imported_total')
    .eq('workspace_id', workspaceId);
  if (opts.accountId) q = q.eq('id', opts.accountId);
  const { data } = await q;
  const result: SyncResult = { imported: 0, attached: 0, errors: [], skipped: true };
  const budget = { left: MAX_IMPORTS_PER_RUN };
  const threshold = new Date(Date.now() - SYNC_EVERY_MIN * 60_000).toISOString();

  for (const acc of (data ?? []) as Account[]) {
    // «Займаємо» кабінет: одночасно його синхронізує лише один запит
    let claim = admin.from('job_board_accounts').update({ last_sync_at: new Date().toISOString() }).eq('id', acc.id);
    if (!opts.force) claim = claim.or(`last_sync_at.is.null,last_sync_at.lt.${threshold}`);
    const { data: claimed } = await claim.select('id');
    if (!claimed?.length) continue;
    result.skipped = false;
    try {
      const r = await syncAccount(supabase, acc, budget);
      result.imported += r.imported;
      result.attached += r.attached;
      result.errors.push(...r.failed.slice(0, 3).map((f) => `${acc.label}: ${f}`));
      await admin
        .from('job_board_accounts')
        .update({ status: 'active', last_error: r.failed[0]?.slice(0, 500) ?? null, imported_total: acc.imported_total + r.imported })
        .eq('id', acc.id);
    } catch (e) {
      const message = e instanceof RobotaError ? e.message : 'Неочікувана помилка синхронізації';
      if (!(e instanceof RobotaError)) console.error('job board sync', acc.id, e);
      result.errors.push(`${acc.label}: ${message}`);
      await admin
        .from('job_board_accounts')
        .update({ status: 'error', last_error: message.slice(0, 500), ...(e instanceof RobotaError && e.authFailed ? { token_encrypted: null } : {}) })
        .eq('id', acc.id);
    }
  }
  return result;
}
