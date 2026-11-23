'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { firstIssue, loginSchema, safeNext } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translateError(error) };

  // Фіксуємо вхід у журналі дій (для заблокованих функція відмовить — це не заважає входу)
  await supabase.rpc('log_event', { p_action: 'login', p_entity: 'auth', p_entity_id: null, p_details: null });

  redirect(safeNext(String(formData.get('next') ?? '')));
}
