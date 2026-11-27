import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { StagesEditor, type StageRow } from './editor';

export const metadata: Metadata = { title: 'Етапи воронки' };

export default async function PipelineSettingsPage() {
  await requirePermission('settings.manage');
  const supabase = await createClient();
  const { data: pipeline } = await supabase.from('pipelines').select('id, name').eq('is_default', true).maybeSingle();
  const { data: stages } = pipeline
    ? await supabase.from('pipeline_stages').select('id, name, color, sla_days, is_active, kind, contact_kind').eq('pipeline_id', pipeline.id).is('archived_at', null).order('sort_order')
    : { data: [] };
  const list = (stages ?? []) as StageRow[];
  return (
    <>
      <PageHeader
        title="Етапи воронки"
        description="Порядок, назва, колір, норма днів на етапі (картка підсвічується червоним, якщо кандидат «завис»), додавання і видалення етапів"
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      <Card>
        <StagesEditor stages={list} />
        <p className="mt-4 text-xs text-ink-soft">
          Усі зміни зберігаються одразу. Стрілки ↑ ↓ змінюють порядок. «з датою» — при переході на етап CRM попросить дату і час зустрічі.
          Вимкнений етап зникає з воронок усіх вакансій. Набір етапів для конкретної вакансії налаштовується на сторінці вакансії.
          Службові етапи (перший, офер, вихід, відмови) не видаляються.
        </p>
      </Card>
    </>
  );
}
