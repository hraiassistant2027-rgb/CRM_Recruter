'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { updatePassword } from './actions';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, initialFormState);
  const needsMfa = state.error?.includes('кодом');

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && (
        <Alert>
          {state.error}
          {needsMfa && (
            <>
              {' '}
              <Link href="/mfa/verify?next=/update-password" className="underline">
                Підтвердити код
              </Link>
            </>
          )}
        </Alert>
      )}
      <Field label="Новий пароль" htmlFor="password" hint="Щонайменше 12 символів, літери і цифри. Зручно — кілька слів через дефіс.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Повторіть пароль" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Зберігаємо…">
        Зберегти пароль
      </SubmitButton>
    </form>
  );
}
