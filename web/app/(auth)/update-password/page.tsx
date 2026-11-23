import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { createClient } from '@/lib/supabase/server';
import { UpdatePasswordForm } from './update-password-form';

export const metadata: Metadata = { title: 'Новий пароль' };

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/login?error=link');

  return (
    <AuthShell title="Встановіть пароль" subtitle={`Обліковий запис: ${data.user.email ?? ''}`}>
      <UpdatePasswordForm />
    </AuthShell>
  );
}
