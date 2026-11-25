import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { CANDIDATE_COLUMNS, type CandidateRow } from '@/lib/candidates';
import { Card, PageHeader } from '@/components/ui';
import { CandidateForm } from '../../candidate-form';
import { loadFields } from '@/lib/custom-fields-load';

export const metadata: Metadata = { title: 'Редагування кандидата' };

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('candidates.update');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [{ data: candidate }, { data: sources }, customFields] = await Promise.all([
    supabase.from('candidates').select(CANDIDATE_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle<CandidateRow>(),
    supabase.from('sources').select('id, name').eq('is_active', true).order('sort_order'),
    loadFields(supabase, 'candidates'),
  ]);
  if (!candidate) notFound();

  return (
    <>
      <PageHeader
        title={`Редагування: ${candidate.full_name}`}
        actions={<Link href={`/candidates/${id}`} className="text-sm text-ink-soft underline">← До картки</Link>}
      />
      <Card>
        <CandidateForm sources={sources ?? []} candidate={candidate} customFields={customFields} />
      </Card>
    </>
  );
}
