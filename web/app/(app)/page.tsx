import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Badge, Card, PageHeader } from '@/components/ui';
import { firstNameOf } from '@/lib/email';
import { loadAgenda } from '@/lib/interviews-load';
import { KIND_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatInterviewDate, formatTime, kyivToDate, todayKyiv } from '@/lib/time';
import { HrHandoffList, type HandoffRow } from '@/components/hr-handoff';
import { formatDate } from '@/lib/candidates';

export const metadata: Metadata = { title: 'Dashboard' };

async function countOf(table: string, filter?: (q: any) => any): Promise<number | null> {
  const supabase = await createClient();
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

export default async function DashboardPage() {
  const session = await requireSession();
  const p = session.permissions;

  // Реальні цифри з бази (з урахуванням прав користувача). Повний дашборд — етап 7.
  const [candidates, openVacancies, activeApplications] = await Promise.all([
    can(p, 'candidates.read') ? countOf('candidates', (q) => q.is('deleted_at', null)) : Promise.resolve(null),
    can(p, 'vacancies.read') ? countOf('vacancies', (q) => q.eq('status', 'open')) : Promise.resolve(null),
    can(p, 'applications.read') ? countOf('applications', (q) => q.is('closed_at', null)) : Promise.resolve(null),
  ]);

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

  const stats = [
    { label: 'Кандидатів у базі', value: candidates, href: '/candidates' },
    { label: 'Відкритих вакансій', value: openVacancies, href: '/vacancies' },
    { label: 'Активних відгуків у воронці', value: activeApplications, href: '/pipeline' },
  ].filter((s) => s.value !== null);

  return (
    <>
      <PageHeader title={`Вітаємо, ${firstNameOf(session.profile.full_name)}!`} description="Короткий огляд рекрутингу" />
      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href}>
              <Card className="transition-colors hover:border-accent">
                <p className="text-sm text-ink-soft">{s.label}</p>
                <p className="mt-2 text-3xl font-semibold">{s.value}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {can(p, 'applications.read') && (
        <Card className="mt-6">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-medium">Передати кадровикам на оформлення</h2>
            <span className="text-xs text-ink-soft">Кандидати на етапі «Офер»</span>
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
      <Card className="mt-6">
        <p className="text-sm text-ink-soft">Повний дашборд із конверсією воронки, термінами закриття вакансій і ефективністю рекрутерів з'явиться на етапі 7.</p>
      </Card>
    </>
  );
}
