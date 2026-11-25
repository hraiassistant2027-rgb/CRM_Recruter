'use server';
import { randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { translateError } from '@/lib/errors';
import { uuidSchema } from '@/lib/validation';
import type { FormState } from '@/lib/form-state';

export async function createRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission('roles.manage');
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (name.length < 2 || name.length > 60) return { error: 'Назва ролі — від 2 до 60 символів' };
  if (description.length > 300) return { error: 'Опис — до 300 символів' };
  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from('roles').insert({ id, code: `r_${randomBytes(5).toString('hex')}`, name, description: description || null });
  if (error) return { error: translateError(error) };
  revalidatePath('/settings/roles');
  redirect(`/settings/roles?role=${id}&notice=created`);
}

export async function updateRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission('roles.manage');
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірна роль' };
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (name.length < 2 || name.length > 60) return { error: 'Назва ролі — від 2 до 60 символів' };
  const supabase = await createClient();
  const { data: role } = await supabase.from('roles').select('code').eq('id', id.data).maybeSingle();
  if (!role) return { error: 'Роль не знайдено' };

  // Права: значення поля perm:<код> = '' (немає) | 'all' | 'own'
  const wanted = new Map<string, 'all' | 'own'>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('perm:')) continue;
    if (value === 'all' || value === 'own') wanted.set(key.slice(5), value);
  }
  const { error: e1, data: upd } = await supabase.from('roles').update({ name, description: description || null }).eq('id', id.data).select('id');
  if (e1) return { error: translateError(e1) };
  if (!upd?.length) return { error: 'Немає права змінювати ролі (потрібен вхід з кодом підтвердження)' };

  if (role.code !== 'super_admin') {
    const { data: current } = await supabase.from('role_permissions').select('permission_code, scope').eq('role_id', id.data);
    const have = new Map(((current ?? []) as { permission_code: string; scope: string }[]).map((r) => [r.permission_code, r.scope]));
    const remove = [...have.keys()].filter((c) => !wanted.has(c));
    const upsert = [...wanted.entries()].filter(([c, s]) => have.get(c) !== s).map(([c, s]) => ({ role_id: id.data, permission_code: c, scope: s }));
    if (remove.length) {
      const { error } = await supabase.from('role_permissions').delete().eq('role_id', id.data).in('permission_code', remove);
      if (error) return { error: translateError(error) };
    }
    if (upsert.length) {
      const { error } = await supabase.from('role_permissions').upsert(upsert, { onConflict: 'role_id,permission_code' });
      if (error) return { error: translateError(error) };
    }
  }
  revalidatePath('/settings/roles');
  return { ok: 'Роль збережено. Нові права діють з наступного відкриття сторінки користувачем.' };
}

export async function deleteRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission('roles.manage');
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірна роль' };
  const supabase = await createClient();
  const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', id.data);
  if (count) return { error: `Роль призначена ${count} користувачам — спершу змініть їм роль у розділі «Користувачі»` };
  const { data, error } = await supabase.from('roles').delete().eq('id', id.data).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права видаляти ролі' };
  revalidatePath('/settings/roles');
  redirect('/settings/roles?notice=deleted');
}
