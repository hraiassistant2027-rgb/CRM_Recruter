'use client';
import { useActionState } from 'react';
import { changePassword, updateProfile } from './actions';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState, type FormState } from '@/lib/form-state';

function Message({ state }: { state: FormState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok) return <Alert kind="success">{state.ok}</Alert>;
  return null;
}

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Ім'я та прізвище" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={fullName} required />
      </Field>
      <Field label="Телефон" htmlFor="phone" hint="Необов'язково">
        <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ''} />
      </Field>
      <Message state={state} />
      <SubmitButton pendingText="Зберігаємо…">Зберегти</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Новий пароль" htmlFor="password" hint="Щонайменше 12 символів, літери та цифри">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Повторіть пароль" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Message state={state} />
      <SubmitButton pendingText="Змінюємо…">Змінити пароль</SubmitButton>
    </form>
  );
}
