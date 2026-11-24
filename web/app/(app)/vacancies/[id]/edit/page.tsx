import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { canOn } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { VACANCY_COLUMNS, type VacancyRow } from '@/lib/vacancies';
import { Card, PageHeader } from '@/components/ui';
import { VacancyForm } from '../../vacancy-form';
import { loadOptions } from '../../load';

export const metadata: Metadata = { title: 'Редагування вакансії' };

export default async function EditVacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('vacancies.manage');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const [{ data: vacancy }, options] = await Promise.all([
    supabase.from('vacancies').select(VACANCY_COLUMNS).eq('id', id).maybeSingle<VacancyRow>(),
    loadOptions(supabase),
  ]);
  if (!vacancy) notFound();
  const mine = vacancy.recruiter_id === session.userId || vacancy.hiring_manager_id === session.userId;
  if (!canOn(session.permissions, 'vacancies.manage', mine)) redirect(`/vacancies/${id}`);
  return (
    <>
      <PageHeader title={`Редагування: ${vacancy.title}`} actions={<Link href={`/vacancies/${id}`} className="text-sm text-ink-soft underline">← До вакансії</Link>} />
      <Card>
        <VacancyForm vacancy={vacancy} {...options} currentUserId={session.userId} />
      </Card>
    </>
  );
}
