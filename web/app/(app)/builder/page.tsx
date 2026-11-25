import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { FieldForm, FieldRow } from '@/components/field-builder';
import { loadFields } from '@/lib/custom-fields-load';
import { ENTITY_LABELS } from '@/lib/custom-fields';

export const metadata: Metadata = { title: 'Конструктор CRM' };

export default async function BuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('builder.edit');
  const sp = await searchParams;
  const entity = (Array.isArray(sp.entity) ? sp.entity[0] : sp.entity) === 'vacancies' ? 'vacancies' : 'candidates';
  const all = await loadFields(await createClient(), entity, true);
  const active = all.filter((f) => !f.archived_at);
  const archived = all.filter((f) => f.archived_at);

  return (
    <>
      <PageHeader
        title="Конструктор CRM"
        description="Додавайте власні поля в картки — вони одразу з'являються у формах, картках і (за бажанням) у списку"
      />
      <nav className="mb-4 inline-flex gap-1 rounded-xl border border-line bg-surface p-1" aria-label="Картки">
        {Object.entries(ENTITY_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/builder?entity=${key}`}
            aria-current={entity === key ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${entity === key ? 'bg-accent text-ink' : 'text-ink-soft hover:bg-white'}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <h2 className="font-medium">Додаткові поля: {ENTITY_LABELS[entity].toLowerCase()}</h2>
          <p className="mb-2 text-xs text-ink-soft">
            Стрілками змінюється порядок у формі. «Приховати» прибирає поле з форм і карток, але заповнені значення зберігаються — поле можна повернути.
          </p>
          {active.length === 0 ? (
            <p className="py-3 text-sm text-ink-soft">Власних полів ще немає. Додайте перше праворуч.</p>
          ) : (
            <ul className="divide-y divide-line">
              {active.map((f, i) => (
                <FieldRow key={f.id} field={f} entity={entity} first={i === 0} last={i === active.length - 1} />
              ))}
            </ul>
          )}
          {archived.length > 0 && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm text-ink-soft">Приховані поля ({archived.length})</summary>
              <ul className="divide-y divide-line">
                {archived.map((f) => (
                  <FieldRow key={f.id} field={f} entity={entity} first last />
                ))}
              </ul>
            </details>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Нове поле</h2>
          <FieldForm entity={entity} />
        </Card>
      </div>
    </>
  );
}
