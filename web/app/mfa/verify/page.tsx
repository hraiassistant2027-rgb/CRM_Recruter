import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/validation';
import { MfaVerify } from './mfa-verify';

export const metadata: Metadata = { title: 'Підтвердження входу' };

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (aal?.currentLevel === 'aal2') redirect(next);
  if (aal?.nextLevel !== 'aal2') redirect('/mfa/setup');

  return (
    <AuthShell title="Підтвердження входу" subtitle="Введіть 6 цифр із застосунку Google Authenticator на телефоні">
      <MfaVerify next={next} />
      <p className="mt-4 text-xs text-ink-soft">
        Втратили доступ до телефону? Зверніться до адміністратора — він скине двофакторну перевірку для вашого акаунта.
      </p>
      <div className="mt-6 border-t border-line pt-4">
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
