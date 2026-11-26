import type { Metadata } from 'next';
import { formatBytes, loadStorageUsage } from '@/lib/storage-usage';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { firstNameOf } from '@/lib/email';
import { loadAgenda } from '@/lib/interviews-load';
import { KIND_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatInterviewDate, formatTime, kyivToDate, todayKyiv } from '@/lib/time';
import { HrHandoffList, type HandoffRow } from '@/components/hr-handoff';
import { formatDate } from '@/lib/candidates';
import { WorkspaceStats } from '@/components/workspace-stats';
import { CATEGORICAL, Donut, FunnelChart, OpenVacancyBars, type FunnelRow, type Slice } from '@/components/dashboard-charts';

type Overview = {
  funnel: FunnelRow[];
  reasons: { name: string; side: 'company' | 'candidate'; count: number }[];
  sources: Slice[];
  open_vacancies: { id: string; title: string; days: number; color: string }[];
  avg_open_days: number | null;
};
import { getWorkspaces } from '@/lib/workspace-server';
import type { WorkspaceCode } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  // Попередження адміністраторам, коли сховище файлів майже заповнене
  const storage = can(session.permissions, 'settings.manage') ? await loadStorageUsage(await createClient()) : null;
  const p = session.permissions;

  const sp = await searchParams;
  const { current, list: workspaces } = await getWorkspaces();
  const curCode: WorkspaceCode = current?.code ?? 'kan';
  // У KAN Talent адміністратор може показати під основним дашборд HomeHub
  const homehub = curCode === 'kan' ? workspaces.find((w) => w.code === 'homehub') : undefined;
  const showHomehub = Boolean(homehub) && sp.homehub === '1';

  // Аналітичні графіки дашборда (за весь період; воронка, відмови і джерела — по всіх вакансіях або одній)
  const canCharts = can(p, 'analytics.read') || can(p, 'applications.read');
  const vacRaw = Array.isArray(sp.vacancy) ? sp.vacancy[0] : sp.vacancy;
  const vacancyFilter = vacRaw && /^[0-9a-f-]{36}$/i.test(vacRaw) ? vacRaw : null;
  let overview: Overview | null = null;
  let vacancyOptions: { id: string; title: string }[] = [];
  if (canCharts) {
    const sb = await createClient();
    const [{ data: ov }, { data: vs }] = await Promise.all([
      sb.rpc('dashboard_overview', { p_vacancy: vacancyFilter }),
      sb.from('vacancies').select('id, title, status').neq('status', 'draft').order('opened_at', { ascending: false }).limit(300),
    ]);
    overview = (ov as Overview | null) ?? null;
    vacancyOptions = (vs ?? []) as { id: string; title: string }[];
  }

  const today = todayKyiv();
  const agenda = can(p, 'applications.read')
    ? await loadAgenda(await createClient(), kyivToDate(today, '00:00')!.toISOString(), kyivToDate(addDays(today, 2), '00:00')!.toISOString(), session.userId)
    : [];

  // Передача кадровикам: кандидати на етапі «Офер»
  let handoffRows: HandoffRow[] = [];
  let hrContacts: { id: string; name: string; email: string }[] = [];
  let gmailReady = false;
  if (can(p, 'applications.read')) {
    const sb = await createClient();
    const { data: offerStages } = await sb.from('pipeline_stages').select('id').eq('contact_kind', 'offer');
    const stageIds = ((offerStages ?? []) as { id: string }[]).map((s) => s.id);
    const { data: apps } = stageIds.length
      ? await sb
          .from('applications')
          .select('id, candidate_id, vacancy_id, hr_docs_status, hr_approval_status, candidates(full_name, phone), vacancies(title, recruiter_id, hiring_manager_id)')
          .in('stage_id', stageIds)
          .order('stage_changed_at', { ascending: false })
          .limit(100)
      : { data: [] };
    type V = { title: string; recruiter_id: string | null; hiring_manager_id: string | null };
    type A = {
      id: string;
      candidate_id: string;
      hr_docs_status: 'pending' | 'passed';
      hr_approval_status: 'pending' | 'signed';
      candidates: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null;
      vacancies: V | V[] | null;
    };
    const list = (apps ?? []) as unknown as A[];
    const ids = list.map((a) => a.id);
    const [{ data: offers }, { data: handoffs }, { data: contacts }, { data: account }] = await Promise.all([
      ids.length ? sb.from('interviews').select('application_id, kind, starts_at, status').in('application_id', ids).in('kind', ['offer', 'polygraph']).neq('status', 'cancelled').order('starts_at') : Promise.resolve({ data: [] }),
      ids.length ? sb.from('hr_handoffs').select('application_id, hr_email, sent_at').in('application_id', ids).order('sent_at') : Promise.resolve({ data: [] }),
      sb.from('hr_contacts').select('id, name, email').eq('is_active', true).order('name'),
      sb.from('email_accounts').select('status').eq('user_id', session.userId).maybeSingle(),
    ]);
    type Ev = { application_id: string; kind: string; starts_at: string; status: string };
    const evs = (offers ?? []) as Ev[];
    const offerAt = new Map(evs.filter((o) => o.kind === 'offer').map((o) => [o.application_id, o.starts_at]));
    const polyOf = new Map(evs.filter((o) => o.kind === 'polygraph').map((o) => [o.application_id, o]));
    const handed = new Map(((handoffs ?? []) as { application_id: string; hr_email: string; sent_at: string }[]).map((h) => [h.application_id, h]));
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
    handoffRows = list.map((a) => {
      const at = offerAt.get(a.id);
      const h = handed.get(a.id);
      return {
        applicationId: a.id,
        candidateId: a.candidate_id,
        candidateName: one(a.candidates)?.full_name ?? 'Кандидат',
        phone: one(a.candidates)?.phone ?? null,
        vacancyTitle: one(a.vacancies)?.title ?? '',
        offerAt: at ? `${formatInterviewDate(at)}, ${formatTime(at)}` : null,
        lastHandoff: h ? `${formatDate(h.sent_at, true)} → ${h.hr_email}` : null,
        docs: a.hr_docs_status,
        approval: a.hr_approval_status,
        polygraph: (() => {
          const pg = polyOf.get(a.id);
          if (!pg) return 'не призначено';
          if (pg.status === 'done') return 'пройдено';
          if (pg.status === 'no_show') return 'кандидат не з’явився';
          return `заплановано на ${formatInterviewDate(pg.starts_at)}, ${formatTime(pg.starts_at)}`;
        })(),
        canEdit: (() => {
          const v = one(a.vacancies);
          const scope = p['applications.update'];
          return scope === 'all' || (scope === 'own' && !!v && (v.recruiter_id === session.userId || v.hiring_manager_id === session.userId));
        })(),
      };
    });
    hrContacts = (contacts ?? []) as { id: string; name: string; email: string }[];
    gmailReady = (account as { status: string } | null)?.status === 'active';
  }

  return (
    <>
      <PageHeader title={`Вітаємо, ${firstNameOf(session.profile.full_name)}!`} description="Короткий огляд рекрутингу" />
      {storage && storage.ratio >= 0.8 && (
        <div className="mb-4">
          <Alert>
            Сховище резюме заповнене на {Math.round(storage.ratio * 100)}% ({formatBytes(storage.bytes)} з {formatBytes(storage.limit)}).{' '}
            <Link href="/settings" className="underline">Деталі в налаштуваннях</Link> — коли місце закінчиться, нові резюме не завантажуватимуться.
          </Alert>
        </div>
      )}
      <WorkspaceStats ws={curCode} current={curCode} permissions={p} />
      {overview && (
        <>
          <Card className="mt-6">
            <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <div>
                <h2 className="font-medium">Тривалість роботи над поточними вакансіями</h2>
                <p className="text-xs text-ink-soft">Відкриті вакансії і вакансії на паузі</p>
                <div className="mt-4 rounded-xl border border-line p-4 text-center">
                  <div className="text-xs text-ink-soft">Середній час роботи</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">{overview.avg_open_days != null ? `${overview.avg_open_days} дн.` : '—'}</div>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Днів у роботі по вакансіях</h3>
                <OpenVacancyBars items={overview.open_vacancies} />
              </div>
            </div>
          </Card>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-medium">Воронка, відмови і джерела</h2>
              <p className="text-xs text-ink-soft">За весь період</p>
            </div>
            <form method="get" className="flex flex-wrap items-center gap-2">
              {sp.homehub === '1' && <input type="hidden" name="homehub" value="1" />}
              <label htmlFor="dash-vacancy" className="text-sm text-ink-soft">Вакансія</label>
              <select id="dash-vacancy" name="vacancy" defaultValue={vacancyFilter ?? ''} className="max-w-64 rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
                <option value="">Усі вакансії</option>
                {vacancyOptions.map((v) => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong">Показати</button>
            </form>
          </div>
          <div className="mt-3 grid gap-4 xl:grid-cols-[3fr_2fr_2fr]">
            <Card>
              <h3 className="font-medium">Воронка рекрутингу</h3>
              <p className="mb-3 text-xs text-ink-soft">
                <span className="mr-3 inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#4caf50]" aria-hidden />пройшли етап або ще на ньому</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#ef5350]" aria-hidden />вибули на етапі</span>
              </p>
              <FunnelChart rows={overview.funnel} />
            </Card>
            <Card>
              <h3 className="mb-3 font-medium">Причини відмов</h3>
              <Donut
                label="Причини відмов"
                empty="Відмов ще немає."
                items={overview.reasons.map((r, i) => ({
                  name: r.side === 'candidate' ? `${r.name} (відмовився кандидат)` : r.name,
                  count: r.count,
                  color: CATEGORICAL[i % CATEGORICAL.length],
                }))}
              />
            </Card>
            <Card>
              <h3 className="mb-3 font-medium">Джерела кандидатів</h3>
              <Donut label="Джерела кандидатів" empty="Кандидатів у вакансіях ще немає." items={overview.sources} />
            </Card>
          </div>
        </>
      )}
      {can(p, 'applications.read') && (
        <Card className="mt-6">
          <div className="mb-1 grid max-w-4xl gap-1 px-2 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end md:gap-x-6">
            <h2 className="font-medium">Кандидати на оформлення</h2>
            <span className="text-xs text-ink-soft">Статус готовності перевірок кандидата</span>
          </div>
          {handoffRows.length === 0 ? (
            <p className="text-sm text-ink-soft">Кандидатів на етапі «Офер» немає.</p>
          ) : (
            <HrHandoffList rows={handoffRows} contacts={hrContacts} canSend={can(p, 'email.send')} gmailReady={gmailReady} />
          )}
        </Card>
      )}
      {can(p, 'applications.read') && (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-medium">Мої співбесіди сьогодні і завтра</h2>
            <Link href="/calendar" className="text-sm underline">
              Календар →
            </Link>
          </div>
          {agenda.length === 0 ? (
            <p className="text-sm text-ink-soft">Співбесід немає.</p>
          ) : (
            <ul className="divide-y divide-line">
              {agenda.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Badge tone={dateToKyiv(i.starts_at).date === today ? 'warn' : 'neutral'}>
                    {dateToKyiv(i.starts_at).date === today ? 'сьогодні' : 'завтра'} {formatTime(i.starts_at)}
                  </Badge>
                  {i.candidate_id ? (
                    <Link href={`/candidates/${i.candidate_id}`} className="font-medium hover:underline">
                      {i.candidate_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{i.candidate_name}</span>
                  )}
                  <span className="text-xs text-ink-soft">
                    {KIND_LABELS[i.kind] ?? i.kind} · {i.vacancy_title}
                  </span>
                  {i.meet_link && (
                    <a href={i.meet_link} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                      Google Meet
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {homehub && (
        <section data-theme="homehub" className="mt-8 rounded-2xl border border-line bg-surface p-4" aria-label="Дашборд HomeHub">
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={homehub.icon} alt="" aria-hidden="true" className="h-8 w-8 rounded-lg bg-white object-contain" />
            <h2 className="font-medium">HomeHub — управляюча компанія</h2>
            <Link
              href={showHomehub ? '/' : '/?homehub=1'}
              scroll={false}
              className="ml-auto rounded-lg border border-accent-strong bg-white px-3 py-1.5 text-sm font-medium text-accent-strong hover:bg-accent-soft"
            >
              {showHomehub ? 'Сховати дашборд HomeHub' : 'Показати дашборд HomeHub'}
            </Link>
          </div>
          {showHomehub && (
            <div className="mt-4">
              <WorkspaceStats ws="homehub" current={curCode} permissions={p} />
              <p className="mt-3 text-xs text-ink-soft">Клік на картку відкриє розділ у просторі HomeHub.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
