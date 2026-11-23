'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signIn } from './actions';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(signIn, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {notice && !state.error && <Alert kind="info">{notice}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Пароль" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Входимо…">
        Увійти
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/reset-password" className="text-ink-soft underline hover:text-ink">
          Забули пароль?
        </Link>
      </p>
    </form>
  );
}
