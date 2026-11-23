'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { translateError } from '@/lib/errors';
import { firstIssue, totpCodeSchema } from '@/lib/validation';
import { Alert, Button, Field, Input } from '@/components/ui';

export function MfaVerify({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = totpCodeSchema.safeParse(new FormData(e.currentTarget).get('code'));
    if (!parsed.success) {
      setError(firstIssue(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (listError || !factor) {
      setError(translateError(listError));
      setBusy(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
    if (verifyError) {
      setError(translateError(verifyError));
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Код" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123456"
          required
          autoFocus
          className="text-center text-lg tracking-[0.3em]"
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Перевіряємо…' : 'Увійти'}
      </Button>
    </form>
  );
}
