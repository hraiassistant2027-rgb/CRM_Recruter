'use client';
import { useActionState } from 'react';
import { addDictionaryItem, moveStage, setDictionaryItemActive, updateHrContact, updateSourceColor, updateStage } from './actions';
import { Alert, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';

export function AddItemForm({ kind, extraLabel }: { kind: string; extraLabel?: string }) {
  const [state, action] = useActionState(addDictionaryItem, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap gap-2">
        <Input name="name" placeholder="Назва" aria-label="Назва" className="min-w-40 flex-1" />
        {extraLabel && <Input name="extra" placeholder={extraLabel} aria-label={extraLabel} className="min-w-40 flex-1" />}
        <SubmitButton variant="secondary" pendingText="…">Додати</SubmitButton>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function ToggleItem({ kind, id, active }: { kind: string; id: string; active: boolean }) {
  const [state, action] = useActionState(setDictionaryItemActive, initialFormState);
  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      <SubmitButton variant="ghost" pendingText="…">{active ? 'Вимкнути' : 'Увімкнути'}</SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function StageForm({ stage }: { stage: { id: string; name: string; color: string; sla_days: number | null; is_active: boolean; kind: string } }) {
  const [state, action] = useActionState(updateStage, initialFormState);
  return (
    <form action={action} className="grid items-center gap-2 py-2 sm:grid-cols-[48px_1fr_110px_120px_auto]">
      <input type="hidden" name="id" value={stage.id} />
      <input type="color" name="color" defaultValue={stage.color} aria-label="Колір" className="h-9 w-12 cursor-pointer rounded border border-line" />
      <Input name="name" defaultValue={stage.name} aria-label="Назва етапу" />
      <Input name="sla_days" defaultValue={stage.sla_days ?? ''} inputMode="numeric" placeholder="норма, дн." aria-label="Норма днів на етапі" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={stage.is_active} className="accent-[var(--color-accent-strong)]" />
        активний
      </label>
      <SubmitButton variant="secondary" pendingText="…">Зберегти</SubmitButton>
      {(state.error || state.ok) && (
        <div className="sm:col-span-5">{state.error ? <Alert>{state.error}</Alert> : <Alert kind="success">{state.ok}</Alert>}</div>
      )}
    </form>
  );
}

export function StageOrderButtons({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  const [state, action] = useActionState(moveStage, initialFormState);
  return (
    <form action={action} className="flex flex-col items-center gap-0.5">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        name="dir"
        value="up"
        disabled={first}
        aria-label="Підняти етап вище"
        title="Вище"
        className="rounded border border-line bg-white px-2 text-sm leading-5 hover:bg-surface disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="submit"
        name="dir"
        value="down"
        disabled={last}
        aria-label="Опустити етап нижче"
        title="Нижче"
        className="rounded border border-line bg-white px-2 text-sm leading-5 hover:bg-surface disabled:opacity-30"
      >
        ↓
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function HrContactForm({ id, name, email }: { id: string; name: string; email: string }) {
  const [state, action] = useActionState(updateHrContact, initialFormState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="name" defaultValue={name} aria-label="Ім'я кадровика" className="min-w-32 flex-1" />
      <Input name="email" type="email" defaultValue={email} aria-label="Email кадровика" className="min-w-48 flex-[2]" />
      <SubmitButton variant="secondary" pendingText="…">Зберегти</SubmitButton>
      {state.error && <span className="w-full text-xs text-danger">{state.error}</span>}
      {state.ok && <span className="w-full text-xs text-ok">{state.ok}</span>}
    </form>
  );
}

export function SourceColor({ id, color }: { id: string; color: string }) {
  const [state, action] = useActionState(updateSourceColor, initialFormState);
  return (
    <form action={action} className="flex items-center">
      <input type="hidden" name="id" value={id} />
      <input
        type="color"
        name="color"
        defaultValue={color}
        aria-label="Колір джерела на дашборді"
        title="Колір на дашборді"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-6 w-8 cursor-pointer rounded border border-line"
      />
      {state.error && <span className="ml-1 text-xs text-danger">{state.error}</span>}
    </form>
  );
}
