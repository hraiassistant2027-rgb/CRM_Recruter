import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { toPermissions, type Permissions } from '@/lib/permissions';

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  mfa_required: boolean;
};

export type SessionContext = {
  userId: string;
  profile: Profile;
  permissions: Permissions;
  aal: 'aal1' | 'aal2';
};

// Перевірка сесії для кожної захищеної сторінки:
// вхід → активний профіль → MFA (налаштована і підтверджена в цій сесії) → дозволи.
export const requireSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/login');

  // Профіль бачать лише активні користувачі (RLS), тож заблокований отримає null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, is_active, mfa_required')
    .eq('id', user.id)
    .maybeSingle<Profile>();
  if (!profile || !profile.is_active) redirect('/blocked');

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const current = aalData?.currentLevel === 'aal2' ? 'aal2' : 'aal1';
  const next = aalData?.nextLevel === 'aal2' ? 'aal2' : 'aal1';

  if (next === 'aal2' && current !== 'aal2') redirect('/mfa/verify');
  if (profile.mfa_required && current !== 'aal2') redirect('/mfa/setup');

  const { data: permRows } = await supabase.rpc('my_permissions');

  return {
    userId: user.id,
    profile,
    permissions: toPermissions(permRows as { permission_code: string; scope: string }[] | null),
    aal: current,
  };
});

// Для сторінок, що потребують конкретного дозволу
export async function requirePermission(code: string): Promise<SessionContext> {
  const session = await requireSession();
  if (!(code in session.permissions)) redirect('/forbidden');
  return session;
}
