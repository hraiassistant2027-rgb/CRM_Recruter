'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { archiveField, moveField, saveField } from '@/app/(app)/builder/actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { FIELD_TYPE_LABELS, type FieldDef } from '@/lib/custom-fields';
import type { FormState } from '@/lib/form-state';

const textarea =
  'block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent-strong focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent/15';

export function FieldForm({ entity, field, onDone }: { entity: string; field?: FieldDef; onDone?: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const [type, setType] = useState(field?.type ?? 'text');
  const lockedType = Boolean(field) && !['text', 'long_text'].includes(field!.type);
  const typeChoices = field ? (lockedType ? [field.type] : ['text', 'long_text']) : Object.keys(FIELD_TYPE_LABELS);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        start(async () => {
          const r = await saveField({}, fd);
          setState(r);
          if (r.error) return;
          if (field) onDone?.();
          else {
            form.reset();
            setType('text');
            router.refresh();
          }
        });
      }}
    >
      <input type="hidden" name="entity" value={entity} />
      {field && <input type="hidden" name="id" value={field.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Назва поля *" htmlFor={`name-${field?.id ?? 'new'}`}>
          <Input id={`name-${field?.id ?? 'new'}`} name="name" defaultValue={field?.name} placeholder="Напр.: Посвідчення водія" />
        </Field>
        <Field label="Тип" htmlFor={`type-${field?.id ?? 'new'}`} hint={field ? 'Тип поля після створення не змінюється' : undefined}>
          <Select id={`type-${field?.id ?? 'new'}`} name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={lockedType}>
            {typeChoices.map((t) => (
              <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
            ))}
          </Select>
          {lockedType && <input type="hidden" name="type" value={type} />}
        </Field>
        {(type === 'select' || type === 'multiselect') && (
          <div className="md:col-span-2">
            <Field label="Варіанти — кожен з нового рядка *" htmlFor={`opt-${field?.id ?? 'new'}`} hint="Перейменування варіанта не змінює вже збережені значення в картках">
              <textarea id={`opt-${field?.id ?? 'new'}`} name="options" rows={4} defaultValue={field?.options.join('\n')} className={textarea} placeholder={'B\nC\nCE'} />
            </Field>
          </div>
        )}
        <div className="md:col-span-2">
          <Field label="Підказка під полем (необов'язково)" htmlFor={`help-${field?.id ?? 'new'}`}>
            <Input id={`help-${field?.id ?? 'new'}`} name="help_text" defaultValue={field?.help_text ?? ''} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_required" defaultChecked={field?.is_required} className="h-4 w-4 accent-[var(--color-accent-strong)]" />
          Обов&apos;язкове
        </label>
        {entity === 'candidates' && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="show_in_list" defaultChecked={field?.show_in_list} className="h-4 w-4 accent-[var(--color-accent-strong)]" />
            Показувати колонкою в базі кандидатів
          </label>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && !field && <Alert kind="success">{state.ok}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : field ? 'Зберегти' : 'Додати поле'}</Button>
        {onDone && field && (
          <Button type="button" variant="secondary" onClick={onDone}>Скасувати</Button>
        )}
      </div>
    </form>
  );
}

export function FieldRow({ field, entity, first, last }: { field: FieldDef; entity: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.error ?? null);
      router.refresh();
    });
  const archived = Boolean(field.archived_at);

  return (
    <li className={`py-3 ${archived ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        {!archived && (
          <div className="flex flex-col">
            <button type="button" aria-label="Вище" disabled={first || busy} onClick={() => run(() => moveField(field.id, true))} className="rounded p-0.5 hover:bg-surface disabled:opacity-30">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Нижче" disabled={last || busy} onClick={() => run(() => moveField(field.id, false))} className="rounded p-0.5 hover:bg-surface disabled:opacity-30">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {field.name}
            {field.is_required && <span className="ml-1 text-danger">*</span>}
          </div>
          <div className="text-xs text-ink-soft">
            {FIELD_TYPE_LABELS[field.type] ?? field.type}
            {field.options.length > 0 && ` · ${field.options.join(', ')}`}
            {field.show_in_list && ' · колонка в списку'}
          </div>
        </div>
        {!archived && (
          <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
            <Pencil className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Змінити
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => archiveField(field.id, !archived))}>
          {archived ? 'Повернути' : 'Приховати'}
        </Button>
      </div>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {editing && (
        <div className="mt-3 rounded-lg border border-line bg-surface/50 p-3">
          <FieldForm
            entity={entity}
            field={field}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </li>
  );
}
