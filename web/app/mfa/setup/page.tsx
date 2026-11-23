import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/validation';
import { MfaSetup } from './mfa-setup';

export const metadata: Metadata = { title: 'Налаштування двофакторної перевірки' };

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login');

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') redirect('/');
  if (aal?.nextLevel === 'aal2') redirect('/mfa/verify'); // фактор уже є — потрібна лише перевірка коду

  const sp = await searchParams;
  return (
    <AuthShell
      title="Двофакторна перевірка"
      subtitle="Для захисту даних кандидатів вхід підтверджується кодом із телефону. Налаштування займе 2 хвилини."
    >
      <MfaSetup next={safeNext(sp.next)} />
      <div className="mt-6 border-t border-line pt-4">
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
