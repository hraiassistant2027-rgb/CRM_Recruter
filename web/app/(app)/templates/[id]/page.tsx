import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { htmlToText } from '@/lib/email';
import { Card, PageHeader } from '@/components/ui';
import { TemplateForm } from '../template-form';

export const metadata: Metadata = { title: 'Шаблон листа' };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('templates.manage');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from('email_templates').select('id, name, category, subject, body_html, is_active').eq('id', id).maybeSingle();
  if (!t) notFound();
  return (
    <>
      <PageHeader title={`Шаблон: ${t.name}`} />
      <Card>
        <TemplateForm template={{ id: t.id, name: t.name, category: t.category, subject: t.subject, body: htmlToText(t.body_html), is_active: t.is_active }} />
      </Card>
    </>
  );
}
