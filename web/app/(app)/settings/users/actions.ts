'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { firstIssue, inviteSchema, uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { confirmLink, sendSystemEmail } from '@/lib/system-mail';
import type { FormState } from '@/lib/form-state';
import { getWorkspaces } from '@/lib/workspace-server';

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
  const { current } = await getWorkspaces();
  const wsName = current?.name ?? 'KAN Talent';

  // Посилання-запрошення створює Supabase, а лист надсилається з Gmail адміністратора
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: parsed.data.email,
    options: { data: { full_name: parsed.data.full_name } },
  });
  if (error || !data.user || !data.properties?.hashed_token) return { error: translateError(error) };
  const link = confirmLink(data.properties.hashed_token, 'invite');
  const sent = await sendSystemEmail({
    to: parsed.data.email,
    subject: `Запрошення до ${wsName}`,
    paragraphs: [
      `Добрий день, ${parsed.data.full_name}!`,
      `Вас запрошено до ${wsName} — системи рекрутингу компанії.`
        + ' Натисніть кнопку, щоб встановити пароль. Після цього система попросить налаштувати двофакторну перевірку в застосунку Google Authenticator.',
    ],
    link: { url: link, label: 'Прийняти запрошення' },
    preferredSenderId: me ?? undefined,
  });

  // Новий користувач працює в просторі, з якого його запросили
  if (current && current.code !== 'kan') {
    await supabase.from('workspace_members').insert({ user_id: data.user.id, workspace_id: current.id });
    await supabase.from('workspace_members').delete().eq('user_id', data.user.id).neq('workspace_id', current.id);
  }

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
  if (!sent.sent) {
    return {
      ok: `Користувача створено, але лист не надіслано (${sent.error}). Надішліть йому це одноразове посилання самостійно: ${link}${roleNote}`,
    };
  }
  return { ok: `Запрошення надіслано на ${parsed.data.email} з ${sent.from}.${roleNote}` };
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

// Доступ до просторів (KAN Talent / HomeHub). Супер адміністратор і Адміністратор мають доступ до всіх автоматично.
export async function setUserWorkspaces(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = uuidSchema.safeParse(formData.get('user_id'));
  if (!userId.success) return { error: 'Невірний користувач' };
  const wanted = new Set(formData.getAll('workspaces').map(String));
  if (wanted.size === 0) return { error: 'Оберіть хоча б один простір' };

  const supabase = await createClient();
  if (!(await allowed(supabase, 'users.manage'))) return NO_RIGHTS;
  const [{ data: all }, { data: current }] = await Promise.all([
    supabase.from('workspaces').select('id'),
    supabase.from('workspace_members').select('workspace_id').eq('user_id', userId.data),
  ]);
  const valid = new Set(((all ?? []) as { id: string }[]).map((w) => w.id));
  const have = new Set(((current ?? []) as { workspace_id: string }[]).map((m) => m.workspace_id));
  const toAdd = [...wanted].filter((id) => valid.has(id) && !have.has(id));
  const toRemove = [...have].filter((id) => !wanted.has(id));
  if (toAdd.length) {
    const { error } = await supabase.from('workspace_members').insert(toAdd.map((id) => ({ user_id: userId.data, workspace_id: id })));
    if (error) return { error: translateError(error) };
  }
  if (toRemove.length) {
    const { error } = await supabase.from('workspace_members').delete().eq('user_id', userId.data).in('workspace_id', toRemove);
    if (error) return { error: translateError(error) };
  }
  revalidatePath('/settings/users');
  return { ok: 'Доступ до просторів збережено' };
}
