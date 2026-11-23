'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { firstIssue, newPasswordSchema, profileSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone') ?? '',
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: 'Сесія завершилася. Увійдіть знову.' };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq('id', data.user.id);
  if (error) return { error: translateError(error) };

  revalidatePath('/', 'layout');
  return { ok: 'Профіль збережено' };
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translateError(error) };
  return { ok: 'Пароль змінено' };
}
