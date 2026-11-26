import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { googleFetch, googleSession, type GoogleSession } from '@/lib/google';
import { buildRawEmail, escapeHtml } from '@/lib/email';

// Службові листи CRM (запрошення, відновлення пароля) надсилаються через підключений Gmail,
// а не через поштовий сервер Supabase. Посилання створює Supabase (одноразове, з обмеженим строком дії).

type LinkType = 'invite' | 'recovery';

export function confirmLink(hashedToken: string, type: LinkType): string {
  const qs = new URLSearchParams({ token_hash: hashedToken, type, next: '/update-password' });
  return `${appUrl()}/auth/confirm?${qs.toString()}`;
}

let lastSenderError: string | null = null;

async function senderSession(preferredUserId?: string): Promise<GoogleSession | null> {
  lastSenderError = null;
  if (preferredUserId) {
    try {
      return await googleSession(preferredUserId);
    } catch (e) {
      // Запам'ятовуємо причину (напр., Google скасував доступ) і пробуємо системного відправника
      lastSenderError = e instanceof Error ? e.message : null;
    }
  }
  const admin = createAdminClient();
  const wanted = process.env.SYSTEM_SENDER_EMAIL?.trim().toLowerCase();
  let query = admin.from('email_accounts').select('user_id').eq('status', 'active').order('connected_at').limit(1);
  if (wanted) query = query.eq('google_email', wanted);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  try {
    return await googleSession(data.user_id);
  } catch {
    return null;
  }
}

export async function sendSystemEmail(input: {
  to: string;
  subject: string;
  paragraphs: string[];
  link: { url: string; label: string };
  preferredSenderId?: string;
}): Promise<{ sent: boolean; from?: string; error?: string }> {
  const session = await senderSession(input.preferredSenderId);
  if (!session) {
    return {
      sent: false,
      error: lastSenderError
        ? `${lastSenderError}. Відкрийте «Профіль» → відключіть і знову підключіть Google`
        : 'Немає підключеної скриньки Google для службових листів — підключіть Google у «Профілі»',
    };
  }

  const text = `${input.paragraphs.join('\n\n')}\n\n${input.link.label}: ${input.link.url}\n\nЯкщо ви не очікували цього листа, просто проігноруйте його.\n\nKAN Talent`;
  const html =
    input.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
    `<p><a href="${escapeHtml(input.link.url)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(input.link.label)}</a></p>` +
    `<p style="color:#777;font-size:12px">Якщо кнопка не працює, скопіюйте посилання в браузер:<br>${escapeHtml(input.link.url)}</p>` +
    `<p style="color:#777;font-size:12px">Якщо ви не очікували цього листа, просто проігноруйте його.<br>KAN Talent</p>`;
  try {
    const raw = buildRawEmail({ fromEmail: session.email, fromName: 'KAN Talent', to: input.to, subject: input.subject, text, html });
    await googleFetch(session, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    return { sent: true, from: session.email };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Помилка Google' };
  }
}
