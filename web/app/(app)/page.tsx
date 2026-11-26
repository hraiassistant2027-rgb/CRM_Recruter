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
import type { HandoffRow } from '@/components/hr-handoff';
import { formatDate } from '@/lib/candidates';
import { WorkspaceStats } from '@/components/workspace-stats';
import { DashboardOverview } from '@/components/dashboard-overview';
import type { ItRow } from '@/components/it-prep';
import { OnboardingPanels } from '@/components/onboarding-panels';
import { SplitView } from '@/components/split-view';
import { getWorkspaces } from '@/lib/workspace-server';
import type { WorkspaceCode } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Dashboard' };

function WorkspaceHeading({ name, icon, note }: { name: string; icon: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 px-2 pt-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" aria-hidden="true" className="h-9 w-9 rounded-xl bg-white object-contain p-0.5 shadow-card" />
      <div>
        <h2 className="text-xl font-bold tracking-tight">{name}</h2>
        {note && <p className="text-xs text-ink-soft">{note}</p>}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  // Попередження адміністраторам, коли сховище файлів майже заповнене
  const storage = can(session.permissions, 'settings.manage') ? await loadStorageUsage(await createClient()) : null;
  const p = session.permissions;

  const { current, list: workspaces } = await getWorkspaces();
  const curCode: WorkspaceCode = current?.code ?? 'kan';
  // У KAN Talent адміністратор може показати під основним дашборд HomeHub
  const homehub = curCode === 'kan' ? workspaces.find((w) => w.code === 'homehub') : undefined;
  // Аналітичні графіки дашборда (за весь період; воронка, відмови і джерела — по всіх вакансіях або одній)
  const canCharts = can(p, 'analytics.read') || can(p, 'applications.read');

  const today = todayKyiv();
  const agenda = can(p, 'applications.read')
    ? await loadAgenda(await createClient(), kyivToDate(today, '00:00')!.toISOString(), kyivToDate(addDays(today, 2), '00:00')!.toISOString(), session.userId)
    : [];

  // Передача кадровикам: кандидати на етапі «Офер»
  let handoffRows: HandoffRow[] = [];
  let hrContacts: { id: string; name: string; email: string }[] = [];
  let gmailReady = false;
  let itRows: ItRow[] = [];
  let itEmails: string[] = [];
  if (can(p, 'applications.read')) {
    const sb = await createClient();
    const { data: offerStages } = await sb.from('pipeline_stages').select('id').eq('contact_kind', 'offer');
    const stageIds = ((offerStages ?? []) as { id: string }[]).map((s) => s.id);
    const { data: apps } = stageIds.length
      ? await sb
          .from('applications')
          .select('id, candidate_id, vacancy_id, hr_docs_status, hr_approval_status, candidates(full_name, phone), vacancies(title, recruiter_id, hiring_manager_id, legal_entity_id)')
          .in('stage_id', stageIds)
          .order('stage_changed_at', { ascending: false })
          .limit(100)
      : { data: [] };
    type V = { title: string; recruiter_id: string | null; hiring_manager_id: string | null; legal_entity_id: string | null };
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
    const offerTs = (a: A) => {
      const t = offerAt.get(a.id);
      return t ? Date.parse(t) : Number.MAX_SAFE_INTEGER;
    };
    list.sort((x, y) => offerTs(x) - offerTs(y));
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

    // Підготовка робочого місця IT — для тих самих кандидатів
    const managerIds = [...new Set(list.map((a) => one(a.vacancies)?.hiring_manager_id).filter((x): x is string => !!x))];
    const [{ data: reqs }, { data: its }, { data: entities }, { data: managers }] = await Promise.all([
      ids.length ? sb.from('it_requests').select('application_id, name_latin, pc_type, company, room, accesses, manager, sent_at, sent_to').in('application_id', ids) : Promise.resolve({ data: [] }),
      sb.from('it_contacts').select('email').eq('is_active', true),
      sb.from('legal_entities').select('id, name'),
      managerIds.length ? sb.from('profiles').select('id, full_name').in('id', managerIds) : Promise.resolve({ data: [] }),
    ]);
    type Req = { application_id: string; name_latin: string | null; pc_type: string | null; company: string | null; room: string | null; accesses: string | null; manager: string | null; sent_at: string | null; sent_to: string | null };
    const reqBy = new Map(((reqs ?? []) as Req[]).map((r) => [r.application_id, r]));
    const entityName = new Map(((entities ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name]));
    const managerName = new Map(((managers ?? []) as { id: string; full_name: string }[]).map((m) => [m.id, m.full_name]));
    itEmails = [...new Set(((its ?? []) as { email: string }[]).map((x) => x.email))];
    itRows = handoffRows.map((h, i) => {
      const a = list[i];
      const v = one(a.vacancies);
      const r = reqBy.get(h.applicationId);
      return {
        applicationId: h.applicationId,
        candidateId: h.candidateId,
        candidateName: h.candidateName,
        vacancyTitle: h.vacancyTitle,
        phone: h.phone,
        offerAt: h.offerAt,
        fields: {
          name_latin: r?.name_latin ?? '',
          pc_type: r?.pc_type ?? '',
          company: r?.company ?? (v?.legal_entity_id ? entityName.get(v.legal_entity_id) ?? '' : ''),
          room: r?.room ?? '',
          accesses: r?.accesses ?? '',
          manager: r?.manager ?? (v?.hiring_manager_id ? managerName.get(v.hiring_manager_id) ?? '' : ''),
        },
        sent: r?.sent_at ? `${formatDate(r.sent_at)}, ${formatTime(r.sent_at)} → ${r.sent_to ?? ''}` : null,
        canEdit: h.canEdit,
      };
    });
    gmailReady = (account as { status: string } | null)?.status === 'active';
  }

  return (
    <>
      <PageHeader
        title={`Вітаємо, ${firstNameOf(session.profile.full_name)}!`}
        description="Короткий огляд рекрутингу"
      />
      {storage && storage.ratio >= 0.8 && (
        <div className="mb-4">
          <Alert>
            Сховище резюме заповнене на {Math.round(storage.ratio * 100)}% ({formatBytes(storage.bytes)} з {formatBytes(storage.limit)}).{' '}
            <Link href="/settings" className="underline">Деталі в налаштуваннях</Link> — коли місце закінчиться, нові резюме не завантажуватимуться.
          </Alert>
        </div>
      )}
      <SplitView
        left={
          <>
            {homehub && <WorkspaceHeading name={current?.name ?? 'KAN Talent'} icon={current?.icon ?? '/logo-icon.png'} note="Ваш поточний простір" />}
            <WorkspaceStats ws={curCode} current={curCode} permissions={p} compact={Boolean(homehub)} />
            {canCharts && <DashboardOverview ws={curCode} current={curCode} compact={Boolean(homehub)} />}
          </>
        }
        right={
          homehub ? (
            <div data-theme="homehub" className="space-y-5" aria-label="Дашборд HomeHub">
              <WorkspaceHeading name="HomeHub" icon={homehub.icon} note="Клік на картку відкриє розділ у просторі HomeHub" />
              <WorkspaceStats ws="homehub" current={curCode} permissions={p} compact />
              {canCharts && <DashboardOverview ws="homehub" current={curCode} compact />}
            </div>
          ) : null
        }
      />
      {can(p, 'applications.read') && (
        <OnboardingPanels hrRows={handoffRows} itRows={itRows} contacts={hrContacts} itEmails={itEmails} canSend={can(p, 'email.send')} gmailReady={gmailReady} />
      )}
      {can(p, 'applications.read') && (
        <Card className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">Мої співбесіди сьогодні і завтра</h2>
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
    </>
  );
}
