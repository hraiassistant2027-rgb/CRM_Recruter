import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Badge, Card, PageHeader } from '@/components/ui';
import { firstNameOf } from '@/lib/email';
import { loadAgenda } from '@/lib/interviews-load';
import { KIND_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatTime, kyivToDate, todayKyiv } from '@/lib/time';

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
