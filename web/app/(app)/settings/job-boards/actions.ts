'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getWorkspaces } from '@/lib/workspace-server';
import { encryptToken } from '@/lib/google';
import { attachPending, checkRobotaLogin, syncJobBoards } from '@/lib/job-boards';
import { uuidSchema } from '@/lib/validation';
import type { FormState } from '@/lib/form-state';

const PATH = '/settings/job-boards';

async function guard(): Promise<{ workspaceId: string } | { error: string }> {
  const session = await requireSession();
  if (!can(session.permissions, 'settings.manage')) return { error: 'Немає доступу' };
  const { current } = await getWorkspaces();
  if (!current) return { error: 'Не визначено робочий простір' };
  return { workspaceId: current.id };
}

const accountSchema = z.object({
  label: z.string().trim().min(1, 'Вкажіть назву кабінету').max(100, 'Задовга назва'),
  login: z.string().trim().min(3, 'Вкажіть логін (email) кабінету').max(200, 'Задовгий логін'),
  password: z.string().min(1, 'Вкажіть пароль кабінету').max(200, 'Задовгий пароль'),
});

export async function addJobBoardAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return g;
  const parsed = accountSchema.safeParse({ label: formData.get('label'), login: formData.get('login'), password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте дані' };
  const issue = await checkRobotaLogin(parsed.data.login, parsed.data.password);
  if (issue) return { error: issue };
  const admin = createAdminClient();
  const { error } = await admin.from('job_board_accounts').insert({
    workspace_id: g.workspaceId,
    provider: 'robota_ua',
    label: parsed.data.label,
    login: parsed.data.login.toLowerCase(),
    password_encrypted: encryptToken(parsed.data.password),
    created_by: (await requireSession()).userId,
  });
  if (error) return { error: error.code === '23505' ? 'Цей кабінет уже підключено' : 'Не вдалося зберегти кабінет' };
  revalidatePath(PATH);
  return { ok: 'Кабінет підключено. Натисніть «Отримати відгуки зараз», щоб забрати вакансії та відгуки.' };
}

// Кабінет має належати поточному простору (перевіряємо через права користувача)
async function ownAccount(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from('job_board_accounts').select('id').eq('id', id).maybeSingle();
  return !!data;
}

export async function updateJobBoardPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return g;
  const id = uuidSchema.safeParse(formData.get('id'));
  const password = String(formData.get('password') ?? '');
  if (!id.success || !(await ownAccount(id.data))) return { error: 'Кабінет не знайдено' };
  if (!password || password.length > 200) return { error: 'Вкажіть новий пароль' };
  const admin = createAdminClient();
  const { data: acc } = await admin.from('job_board_accounts').select('login').eq('id', id.data).single();
  const issue = await checkRobotaLogin(acc!.login, password);
  if (issue) return { error: issue };
  await admin
    .from('job_board_accounts')
    .update({ password_encrypted: encryptToken(password), token_encrypted: null, status: 'active', last_error: null })
    .eq('id', id.data);
  revalidatePath(PATH);
  return { ok: 'Пароль оновлено' };
}

export async function deleteJobBoardAccount(id: string): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return g;
  if (!uuidSchema.safeParse(id).success || !(await ownAccount(id))) return { error: 'Кабінет не знайдено' };
  const { error } = await createAdminClient().from('job_board_accounts').delete().eq('id', id);
  if (error) return { error: 'Не вдалося відключити кабінет' };
  revalidatePath(PATH);
  return { ok: 'Кабінет відключено. Уже імпортовані кандидати залишились у CRM.' };
}

export async function linkJobBoardVacancy(accountId: string, externalId: number, vacancyId: string | null): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return g;
  if (!uuidSchema.safeParse(accountId).success || !Number.isSafeInteger(externalId)) return { error: 'Невірні дані' };
  if (vacancyId !== null && !uuidSchema.safeParse(vacancyId).success) return { error: 'Невірна вакансія' };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('job_board_vacancies')
    .select('external_id')
    .eq('account_id', accountId)
    .eq('external_id', externalId)
    .maybeSingle();
  if (!row) return { error: 'Вакансію сайту не знайдено' };
  if (vacancyId) {
    const { data: v } = await supabase.from('vacancies').select('id').eq('id', vacancyId).maybeSingle();
    if (!v) return { error: 'Вакансію CRM не знайдено' };
  }
  await createAdminClient().from('job_board_vacancies').update({ vacancy_id: vacancyId }).eq('account_id', accountId).eq('external_id', externalId);
  const n = vacancyId ? await attachPending(supabase, accountId, externalId, vacancyId) : 0;
  revalidatePath(PATH);
  return { ok: vacancyId ? `Пов'язано${n ? `, у вакансію додано кандидатів: ${n}` : ''}` : 'Зв\'язок прибрано' };
}

export async function syncJobBoardsNow(): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return g;
  const r = await syncJobBoards(await createClient(), g.workspaceId, { force: true });
  revalidatePath(PATH);
  revalidatePath('/candidates');
  const head = r.imported ? `Нових відгуків: ${r.imported}${r.attached ? ` (у вакансії CRM: ${r.attached})` : ''}` : 'Нових відгуків немає';
  return r.errors.length ? { error: `${head}. ${r.errors.join('; ')}` } : { ok: head };
}
