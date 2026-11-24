import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { VacancyForm } from '../vacancy-form';
import { loadOptions } from '../load';

export const metadata: Metadata = { title: 'Нова вакансія' };

export default async function NewVacancyPage() {
  const session = await requirePermission('vacancies.manage');
  const options = await loadOptions(await createClient());
  return (
    <>
      <PageHeader title="Нова вакансія" actions={<Link href="/vacancies" className="text-sm text-ink-soft underline">← До вакансій</Link>} />
      <Card>
        <VacancyForm {...options} currentUserId={session.userId} />
      </Card>
    </>
  );
}
