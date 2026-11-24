import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { AddItemForm, ToggleItem } from './forms';

export const metadata: Metadata = { title: 'Довідники' };

type Item = { id: string; name: string; is_active: boolean; address?: string | null; side?: string };

function Section({ title, hint, kind, items, extraLabel }: { title: string; hint: string; kind: string; items: Item[]; extraLabel?: string }) {
  return (
    <Card>
      <h2 className="font-medium">{title}</h2>
      <p className="mb-3 text-xs text-ink-soft">{hint}</p>
      <ul className="mb-4 divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className={`flex items-center justify-between gap-2 py-1.5 text-sm ${i.is_active ? '' : 'opacity-60'}`}>
            <span className="min-w-0">
              <span className="block truncate">{i.name}</span>
              {i.address && <span className="block truncate text-xs text-ink-soft">{i.address}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {!i.is_active && <Badge>вимкнено</Badge>}
              <ToggleItem kind={kind} id={i.id} active={i.is_active} />
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="py-1.5 text-sm text-ink-soft">Поки порожньо</li>}
      </ul>
      <AddItemForm kind={kind} extraLabel={extraLabel} />
    </Card>
  );
}

export default async function DictionariesPage() {
  await requirePermission('settings.manage');
  const supabase = await createClient();
  const [sites, departments, sources, reasons] = await Promise.all([
    supabase.from('sites').select('id, name, address, is_active').order('name'),
    supabase.from('departments').select('id, name, is_active').order('name'),
    supabase.from('sources').select('id, name, is_active').order('sort_order'),
    supabase.from('rejection_reasons').select('id, name, side, is_active').order('sort_order'),
  ]);
  const r = (reasons.data ?? []) as Item[];
  return (
    <>
      <PageHeader
        title="Довідники"
        description="Вимкнений запис зникає зі списків вибору, але залишається в старих картках"
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Об'єкти" hint="Будівельні об'єкти для вакансій" kind="sites" items={(sites.data ?? []) as Item[]} extraLabel="Адреса (необов'язково)" />
        <Section title="Підрозділи" hint="Відділи та служби компанії" kind="departments" items={(departments.data ?? []) as Item[]} />
        <Section title="Джерела кандидатів" hint="Звідки прийшов кандидат" kind="sources" items={(sources.data ?? []) as Item[]} />
        <Section title="Причини відмови компанії" hint="Етап «Відмова»" kind="company_reasons" items={r.filter((i) => i.side === 'company')} />
        <Section title="Причини відмови кандидата" hint="Етап «Кандидат відмовився»" kind="candidate_reasons" items={r.filter((i) => i.side === 'candidate')} />
      </div>
    </>
  );
}
