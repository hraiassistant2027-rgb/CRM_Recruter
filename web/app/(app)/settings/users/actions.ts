'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { firstIssue, inviteSchema, uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { appUrl } from '@/lib/env';
import type { FormState } from '@/lib/form-state';

const NO_RIGHTS: FormState = { error: 'Недостатньо прав для цієї дії або сесію не підтверджено кодом MFA' };
const BAN_FOREVER = '876000h'; // 100 років

type Supa = Awaited<ReturnType<typeof createClient>>;

// Перевірка права поточного користувача на боці БД (з вимогою MFA в цій сесії).
// Лише після неї дозволено використовувати адмін-клієнт.
async function allowed(supabase: Supa, code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_permission', { p_code: code, p_require_mfa: true });
  return !error && data === true;
}

async function currentUserId(supabase: Supa): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function inviteUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = inviteSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    role_code: formData.get('role_code'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  if (!(await allowed(supabase, 'users.manage'))) return NO_RIGHTS;
  const me = await currentUserId(supabase);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.full_name },
    redirectTo: `${appUrl()}/update-password`,
  });
  if (error || !data.user) return { error: translateError(error) };

  // Роль призначаємо від імені адміністратора: діють правила RLS і журнал дій
  let roleNote = '';
  if (await allowed(supabase, 'roles.manage')) {
    const { data: role } = await supabase.from('roles').select('id').eq('code', parsed.data.role_code).maybeSingle();
    const { error: roleError } = role
      ? await supabase.from('user_roles').insert({ user_id: data.user.id, role_id: role.id, granted_by: me })
      : { error: { message: 'role not found' } };
    if (roleError) roleNote = ' Роль призначити не вдалося — зробіть це вручну в списку.';
  } else {
    roleNote = ' Роль призначить SUPER ADMIN.';
  }

  revalidatePath('/settings/users');
  return { ok: `Запрошення надіслано на ${parsed.data.email}.${roleNote}` };
}

export async function setUserActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = uuidSchema.safeParse(formData.get('user_id'));
  if (!userId.success) return { error: 'Невірний користувач' };
  const active = formData.get('active') === 'true';

  const supabase = await createClient();
  if (!(await allowed(supabase, 'users.manage'))) return NO_RIGHTS;
  if ((await currentUserId(supabase)) === userId.data && !active) {
    return { error: 'Не можна заблокувати самого себе' };
  }

  // Спершу профіль (тут база перевіряє права і захищає останнього SUPER ADMIN), потім вхід
  const { error } = await supabase.from('profiles').update({ is_active: active }).eq('id', userId.data);
  if (error) return { error: translateError(error) };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId.data, {
    ban_duration: active ? 'none' : BAN_FOREVER,
  });
  if (banError) return { error: `Профіль змінено, але вхід не оновлено: ${translateError(banError)}` };

  revalidatePath('/settings/users');
  return { ok: active ? 'Доступ відновлено' : 'Доступ заблоковано, активні сесії завершаться' };
}

export async function setUserRoles(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = uuidSchema.safeParse(formData.get('user_id'));
  if (!userId.success) return { error: 'Невірний користувач' };
  const wanted = new Set(formData.getAll('roles').map(String));

  const supabase = await createClient();
  if (!(await allowed(supabase, 'roles.manage'))) return NO_RIGHTS;
  const me = await currentUserId(supabase);

  const [{ data: roles }, { data: current }] = await Promise.all([
    supabase.from('roles').select('id, code'),
    supabase.from('user_roles').select('role_id').eq('user_id', userId.data),
  ]);
  const codeById = new Map((roles ?? []).map((r: { id: string; code: string }) => [r.id, r.code]));
  const idByCode = new Map((roles ?? []).map((r: { id: string; code: string }) => [r.code, r.id]));
  const currentCodes = new Set((current ?? []).map((r: { role_id: string }) => codeById.get(r.role_id)).filter(Boolean) as string[]);

  const toAdd = [...wanted].filter((c) => !currentCodes.has(c) && idByCode.has(c));
  const toRemove = [...currentCodes].filter((c) => !wanted.has(c));

  if (toAdd.length) {
    const { error } = await supabase
      .from('user_roles')
      .insert(toAdd.map((c) => ({ user_id: userId.data, role_id: idByCode.get(c), granted_by: me })));
    if (error) return { error: translateError(error) };
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId.data)
      .in('role_id', toRemove.map((c) => idByCode.get(c)));
    if (error) return { error: translateError(error) };
  }

  revalidatePath('/settings/users');
  return { ok: 'Ролі збережено' };
}

export async function resetUserMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = uuidSchema.safeParse(formData.get('user_id'));
  if (!userId.success) return { error: 'Невірний користувач' };

  const supabase = await createClient();
  if (!(await allowed(supabase, 'users.manage'))) return NO_RIGHTS;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: userId.data });
  if (error) return { error: translateError(error) };
  for (const factor of data?.factors ?? []) {
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: userId.data });
    if (delError) return { error: translateError(delError) };
  }

  await supabase.rpc('log_event', {
    p_action: 'mfa_enrolled',
    p_entity: 'profiles',
    p_entity_id: userId.data,
    p_details: { reset_by_admin: true },
  });
  revalidatePath('/settings/users');
  return { ok: 'Двофакторну перевірку скинуто. При наступному вході користувач налаштує її заново.' };
}
