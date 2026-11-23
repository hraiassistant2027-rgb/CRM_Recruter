import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Card, PageHeader } from '@/components/ui';

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

  const stats = [
    { label: 'Кандидатів у базі', value: candidates, href: '/candidates' },
    { label: 'Відкритих вакансій', value: openVacancies, href: '/vacancies' },
    { label: 'Активних відгуків у воронці', value: activeApplications, href: '/pipeline' },
  ].filter((s) => s.value !== null);

  return (
    <>
      <PageHeader title={`Вітаємо, ${session.profile.full_name.split(' ')[0]}!`} description="Короткий огляд рекрутингу" />
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
      <Card className="mt-6">
        <p className="text-sm text-ink-soft">
          Повний дашборд із конверсією воронки, термінами закриття вакансій і ефективністю рекрутерів з'явиться на етапі 7.
          Зараз база порожня: кандидати й вакансії додаватимуться на етапах 3–4.
        </p>
      </Card>
    </>
  );
}
