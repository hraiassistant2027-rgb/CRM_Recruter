import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { CandidateForm } from '../candidate-form';

export const metadata: Metadata = { title: 'Новий кандидат' };

export default async function NewCandidatePage() {
  await requirePermission('candidates.create');
  const supabase = await createClient();
  const { data: sources } = await supabase.from('sources').select('id, name').eq('is_active', true).order('sort_order');
  return (
    <>
      <PageHeader
        title="Новий кандидат"
        description="Перед збереженням система перевірить, чи немає такого кандидата в базі"
        actions={<Link href="/candidates" className="text-sm text-ink-soft underline">← До бази</Link>}
      />
      <Card>
        <CandidateForm sources={sources ?? []} />
      </Card>
    </>
  );
}
