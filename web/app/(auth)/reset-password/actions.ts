'use server';
import { createClient } from '@/lib/supabase/server';
import { emailSchema } from '@/lib/validation';
import { appUrl } from '@/lib/env';
import type { FormState } from '@/lib/form-state';

const GENERIC_OK =
  'Якщо такий email зареєстровано в системі, на нього надійде лист із посиланням. Перевірте також папку «Спам».';

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: 'Введіть коректний email' };

  const supabase = await createClient();
  // Відповідь однакова незалежно від того, чи існує користувач: так не можна з'ясувати, хто є в системі
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${appUrl()}/auth/confirm?next=/update-password`,
  });
  return { ok: GENERIC_OK };
}
