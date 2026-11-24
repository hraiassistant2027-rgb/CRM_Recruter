'use server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailSchema } from '@/lib/validation';
import { confirmLink, sendSystemEmail } from '@/lib/system-mail';
import type { FormState } from '@/lib/form-state';

const GENERIC_OK =
  'Якщо такий email зареєстровано в системі, на нього надійде лист із посиланням. Перевірте також папку «Спам».';

// Простий захист від масових запитів: не частіше одного листа на адресу за 2 хвилини (в межах одного сервера)
const recent = new Map<string, number>();

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return { error: 'Введіть коректний email' };
  const email = parsed.data.toLowerCase();

  const now = Date.now();
  if ((recent.get(email) ?? 0) > now - 120_000) return { ok: GENERIC_OK };
  recent.set(email, now);

  // Відповідь однакова незалежно від того, чи існує користувач: так не можна з'ясувати, хто є в системі
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id, is_active').eq('email', email).maybeSingle();
  if (!profile || !profile.is_active) return { ok: GENERIC_OK };

  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.properties?.hashed_token) {
    console.error('[reset-password] link', error?.message);
    return { ok: GENERIC_OK };
  }
  const sent = await sendSystemEmail({
    to: email,
    subject: 'Відновлення пароля KAN Talent',
    paragraphs: ['Добрий день!', 'Ви (або хтось інший) попросили змінити пароль до KAN Talent. Посилання діє обмежений час і спрацьовує один раз.'],
    link: { url: confirmLink(data.properties.hashed_token, 'recovery'), label: 'Встановити новий пароль' },
  });
  if (!sent.sent) console.error('[reset-password] send', sent.error);
  return { ok: GENERIC_OK };
}
