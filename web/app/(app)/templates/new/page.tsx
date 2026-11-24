import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { Card, PageHeader } from '@/components/ui';
import { TemplateForm } from '../template-form';

export const metadata: Metadata = { title: 'Новий шаблон' };

export default async function NewTemplatePage() {
  await requirePermission('templates.manage');
  return (
    <>
      <PageHeader title="Новий шаблон листа" />
      <Card>
        <TemplateForm />
      </Card>
    </>
  );
}
