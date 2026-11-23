'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset } from './actions';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';

export default function ResetPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  return (
    <AuthShell title="Відновлення пароля" subtitle="Надішлемо посилання для встановлення нового пароля">
      {state.ok ? (
        <Alert kind="success">{state.ok}</Alert>
      ) : (
        <form action={action} className="space-y-4" noValidate>
          {state.error && <Alert>{state.error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <SubmitButton className="w-full" pendingText="Надсилаємо…">
            Надіслати посилання
          </SubmitButton>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-ink-soft underline hover:text-ink">
          Повернутися до входу
        </Link>
      </p>
    </AuthShell>
  );
}
