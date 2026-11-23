'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { firstIssue, newPasswordSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: 'Сесія завершилася. Відкрийте посилання з листа ще раз.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translateError(error) };

  // Далі — налаштування або перевірка MFA, яку забезпечує загальна перевірка сесії
  redirect('/');
}
