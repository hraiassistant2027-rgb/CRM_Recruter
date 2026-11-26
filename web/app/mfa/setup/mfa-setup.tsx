'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { translateError } from '@/lib/errors';
import { totpCodeSchema, firstIssue } from '@/lib/validation';
import { Alert, Button, Field, Input } from '@/components/ui';

type Enrollment = { factorId: string; qr: string; secret: string };

export function MfaSetup({ next }: { next: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createClient();
      // Прибираємо незавершені спроби налаштування
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `KAN Talent ${new Date().toISOString().slice(0, 16)}`,
      });
      if (enrollError || !data) {
        setError(translateError(enrollError));
        return;
      }
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!enrollment) return;
    const parsed = totpCodeSchema.safeParse(new FormData(e.currentTarget).get('code'));
    if (!parsed.success) {
      setError(firstIssue(parsed.error));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: parsed.data,
    });
    if (verifyError) {
      setError(translateError(verifyError));
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (!enrollment) {
    return error ? <Alert>{error}</Alert> : <p className="text-sm text-ink-soft">Готуємо QR-код…</p>;
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
        <li>Встановіть на телефон застосунок <strong>Google Authenticator</strong> (або Microsoft Authenticator).</li>
        <li>У застосунку натисніть <strong>+</strong> → <strong>Сканувати QR-код</strong> і наведіть камеру на код нижче.</li>
        <li>Введіть 6 цифр, які покаже застосунок.</li>
      </ol>

      <div className="flex justify-center rounded-3xl bg-white shadow-card p-4">
        {/* QR-код повертає Supabase у вигляді SVG data URL */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qr} alt="QR-код для застосунку-автентифікатора" width={192} height={192} />
      </div>

      <div className="text-sm">
        {showSecret ? (
          <p className="break-all rounded-lg bg-surface p-3 font-mono text-xs">{enrollment.secret}</p>
        ) : (
          <button type="button" onClick={() => setShowSecret(true)} className="text-ink-soft underline hover:text-ink">
            Не вдається сканувати? Показати ключ для ручного введення
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Код із застосунку" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            required
            className="text-center text-lg tracking-[0.3em]"
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Перевіряємо…' : 'Підтвердити'}
        </Button>
      </form>
    </div>
  );
}
