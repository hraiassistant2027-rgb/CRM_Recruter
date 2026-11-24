import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { StageForm } from '../dictionaries/forms';

export const metadata: Metadata = { title: 'Етапи воронки' };

const KIND_LABELS: Record<string, string> = {
  open: 'робочі етапи',
  offer: 'оффер',
  hired: 'працевлаштування',
  rejected: 'відмова компанії',
  withdrawn: 'відмова кандидата',
};

export default async function PipelineSettingsPage() {
  await requirePermission('settings.manage');
  const supabase = await createClient();
  const { data: pipeline } = await supabase.from('pipelines').select('id, name').eq('is_default', true).maybeSingle();
  const { data: stages } = pipeline
    ? await supabase.from('pipeline_stages').select('id, name, color, sla_days, is_active, kind, sort_order').eq('pipeline_id', pipeline.id).order('sort_order')
    : { data: [] };
  const list = (stages ?? []) as { id: string; name: string; color: string; sla_days: number | null; is_active: boolean; kind: string }[];
  return (
    <>
      <PageHeader
        title="Етапи воронки"
        description="Назва, колір, норма днів на етапі (картка підсвічується червоним, якщо кандидат «завис») і вимкнення етапу"
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      <Card>
        <div className="divide-y divide-line">
          {list.map((s) => (
            <div key={s.id}>
              <p className="pt-2 text-xs text-ink-soft">{KIND_LABELS[s.kind] ?? s.kind}</p>
              <StageForm stage={s} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-soft">Зміна порядку етапів, нові етапи і правила переходів — у конструкторі CRM (етап 8).</p>
      </Card>
    </>
  );
}
