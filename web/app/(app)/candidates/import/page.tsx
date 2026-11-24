import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { BulkResumeUpload } from '@/components/bulk-resume-upload';

export const metadata: Metadata = { title: 'Завантаження резюме' };

export default async function ImportResumesPage() {
  await requirePermission('candidates.create');
  const supabase = await createClient();
  const { data: sources } = await supabase.from('sources').select('id, name').eq('is_active', true).order('sort_order');
  return (
    <>
      <PageHeader
        title="Завантаження кількох резюме"
        description="Оберіть одразу кілька файлів — для кожного буде створено картку кандидата"
        actions={<Link href="/candidates" className="text-sm text-ink-soft underline">← До бази</Link>}
      />
      <Card>
        <BulkResumeUpload sources={(sources ?? []) as { id: string; name: string }[]} />
      </Card>
    </>
  );
}
