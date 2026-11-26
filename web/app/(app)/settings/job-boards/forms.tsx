'use client';
import { useActionState, useState, useTransition } from 'react';
import { addJobBoardAccount, deleteJobBoardAccount, linkJobBoardVacancy, syncJobBoardsNow, updateJobBoardPassword } from './actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState, type FormState } from '@/lib/form-state';

function Msg({ s }: { s: FormState | null }) {
  if (!s) return null;
  return s.error ? <Alert>{s.error}</Alert> : s.ok ? <Alert kind="success">{s.ok}</Alert> : null;
}

export function AddAccountForm() {
  const [state, action] = useActionState(addJobBoardAccount, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Назва (для себе)" htmlFor="jb-label" hint="Напр.: KAN — будівельні вакансії">
          <Input id="jb-label" name="label" maxLength={100} />
        </Field>
        <Field label="Логін кабінету (email)" htmlFor="jb-login">
          <Input id="jb-login" name="login" type="email" autoComplete="off" />
        </Field>
        <Field label="Пароль кабінету" htmlFor="jb-password" hint="Зберігається зашифрованим, ніхто його не побачить">
          <Input id="jb-password" name="password" type="password" autoComplete="new-password" />
        </Field>
      </div>
      <SubmitButton pendingText="Перевіряємо вхід на robota.ua…">Підключити кабінет</SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function PasswordForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateJobBoardPassword, initialFormState);
  if (!open)
    return (
      <Button variant="ghost" type="button" onClick={() => setOpen(true)}>
        Змінити пароль
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="password" type="password" placeholder="Новий пароль" aria-label="Новий пароль" autoComplete="new-password" className="w-52" />
      <SubmitButton variant="secondary" pendingText="…">Зберегти</SubmitButton>
      <Msg s={state} />
    </form>
  );
}

export function DeleteAccountButton({ id, label }: { id: string; label: string }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<FormState | null>(null);
  return (
    <div>
      <Button
        variant="ghost"
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirm(`Відключити кабінет «${label}»? Уже імпортовані кандидати залишаться в CRM.`)) start(async () => setMsg(await deleteJobBoardAccount(id)));
        }}
      >
        {busy ? '…' : 'Відключити'}
      </Button>
      <Msg s={msg} />
    </div>
  );
}

export function SyncNowButton() {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<FormState | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" disabled={busy} onClick={() => start(async () => setMsg(await syncJobBoardsNow()))}>
        {busy ? 'Отримуємо відгуки… (до хвилини)' : 'Отримати відгуки зараз'}
      </Button>
      <Msg s={msg} />
    </div>
  );
}

export function VacancyLink({
  accountId,
  externalId,
  current,
  options,
}: {
  accountId: string;
  externalId: number;
  current: string | null;
  options: { id: string; title: string }[];
}) {
  const [value, setValue] = useState(current ?? '');
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<FormState | null>(null);
  return (
    <div className="space-y-1">
      <Select
        aria-label="Вакансія в CRM"
        value={value}
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          start(async () => setMsg(await linkJobBoardVacancy(accountId, externalId, v || null)));
        }}
      >
        <option value="">— не пов’язано (кандидати лише в базу) —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </Select>
      {msg?.error && <Alert>{msg.error}</Alert>}
      {msg?.ok && <p className="text-xs text-ok">{msg.ok}</p>}
    </div>
  );
}
