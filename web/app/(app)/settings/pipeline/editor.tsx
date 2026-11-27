'use client';
import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { addStage, deleteStage, moveStageDir, saveStage, type StagePatch } from './actions';
import { Alert, Button, Input, Select } from '@/components/ui';
import { KIND_LABELS as CONTACT_LABELS } from '@/lib/interviews';
import type { FormState } from '@/lib/form-state';

export type StageRow = { id: string; name: string; color: string; sla_days: number | null; is_active: boolean; kind: string; contact_kind: string | null };

const KIND_LABELS: Record<string, string> = {
  open: 'робочий етап',
  offer: 'оффер',
  hired: 'працевлаштування',
  rejected: 'відмова компанії',
  withdrawn: 'відмова кандидата',
};
const CONTACT_KINDS = ['call', 'phone', 'manager', 'repeat', 'polygraph', 'offer', 'start'];

function ContactSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Дата зустрічі при переході">
      <option value="">без дати зустрічі</option>
      {CONTACT_KINDS.map((k) => (
        <option key={k} value={k}>
          з датою: {CONTACT_LABELS[k]}
        </option>
      ))}
    </Select>
  );
}

function Row({ s, index, total, firstOpen }: { s: StageRow; index: number; total: number; firstOpen: boolean }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<FormState | null>(null);
  const [name, setName] = useState(s.name);
  const [sla, setSla] = useState(s.sla_days?.toString() ?? '');
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? r : null);
    });
  const save = (patch: StagePatch) => run(() => saveStage(s.id, patch));
  const removable = s.kind === 'open' && !firstOpen;

  return (
    <div className={`py-3 ${s.is_active ? '' : 'opacity-60'}`}>
      <div className="grid items-center gap-2 md:grid-cols-[auto_44px_minmax(10rem,1fr)_7rem_minmax(12rem,15rem)_auto_auto]">
        <div className="flex gap-1">
          <button type="button" disabled={busy || index === 0} onClick={() => run(() => moveStageDir(s.id, 'up'))} className="rounded border border-line bg-white px-2 leading-6 hover:bg-surface disabled:opacity-30" aria-label="Вище">
            ↑
          </button>
          <button type="button" disabled={busy || index === total - 1} onClick={() => run(() => moveStageDir(s.id, 'down'))} className="rounded border border-line bg-white px-2 leading-6 hover:bg-surface disabled:opacity-30" aria-label="Нижче">
            ↓
          </button>
        </div>
        <input type="color" defaultValue={s.color} onBlur={(e) => e.target.value !== s.color && save({ color: e.target.value })} aria-label="Колір" className="h-9 w-11 cursor-pointer rounded border border-line" />
        <div>
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== s.name && save({ name })} aria-label="Назва етапу" />
          <p className="mt-0.5 text-[11px] text-ink-soft">
            {index + 1}. {KIND_LABELS[s.kind] ?? s.kind}
          </p>
        </div>
        <Input
          value={sla}
          onChange={(e) => setSla(e.target.value)}
          onBlur={() => sla !== (s.sla_days?.toString() ?? '') && save({ sla_days: sla.trim() === '' ? null : Number(sla) })}
          inputMode="numeric"
          placeholder="норма, дн."
          aria-label="Норма днів на етапі"
        />
        <ContactSelect value={s.contact_kind} onChange={(v) => save({ contact_kind: v })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked={s.is_active} onChange={(e) => save({ is_active: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent-strong)]" />
          активний
        </label>
        {removable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(`Видалити етап «${s.name}»?`) && run(() => deleteStage(s.id))}
            className="rounded-lg p-2 text-ink-soft hover:bg-danger-soft hover:text-danger"
            aria-label="Видалити етап"
            title="Видалити етап"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-8" title="Службовий етап — не видаляється" />
        )}
      </div>
      {busy && <p className="mt-1 text-xs text-ink-soft">Зберігаємо…</p>}
      {msg?.error && <div className="mt-2"><Alert>{msg.error}</Alert></div>}
    </div>
  );
}

export function StagesEditor({ stages }: { stages: StageRow[] }) {
  const firstId = stages[0]?.id;
  const openStages = stages.filter((s) => s.kind === 'open');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b9cf0');
  const [sla, setSla] = useState('');
  const [contact, setContact] = useState<string | null>(null);
  const [after, setAfter] = useState(openStages[openStages.length - 1]?.id ?? '');
  const [msg, setMsg] = useState<FormState | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="divide-y divide-line">
        {stages.map((s, i) => (
          <Row key={`${s.id}-${s.name}-${s.is_active}-${s.sla_days}-${s.contact_kind}`} s={s} index={i} total={stages.length} firstOpen={s.id === firstId} />
        ))}
      </div>

      <div className="rounded-2xl bg-panel p-4">
        <h3 className="mb-3 font-bold">Додати етап</h3>
        <div className="grid gap-2 md:grid-cols-[44px_minmax(10rem,1fr)_7rem_minmax(12rem,15rem)_minmax(12rem,15rem)_auto]">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Колір" className="h-10 w-11 cursor-pointer rounded border border-line" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва етапу, напр. «Тестове завдання»" aria-label="Назва нового етапу" />
          <Input value={sla} onChange={(e) => setSla(e.target.value)} inputMode="numeric" placeholder="норма, дн." aria-label="Норма днів" />
          <ContactSelect value={contact} onChange={setContact} />
          <Select value={after} onChange={(e) => setAfter(e.target.value)} aria-label="Після якого етапу">
            {stages.filter((s) => s.kind === 'open').map((s) => (
              <option key={s.id} value={s.id}>
                після «{s.name}»
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              start(async () => {
                const r = await addStage({ name, color, sla_days: sla.trim() ? Number(sla) : null, contact_kind: contact, after: after || null });
                setMsg(r);
                if (!r.error) {
                  setName('');
                  setSla('');
                  setContact(null);
                }
              })
            }
          >
            {busy ? '…' : 'Додати'}
          </Button>
        </div>
        {msg?.error && <div className="mt-2"><Alert>{msg.error}</Alert></div>}
        {msg?.ok && <div className="mt-2"><Alert kind="success">{msg.ok}</Alert></div>}
      </div>
    </div>
  );
}
