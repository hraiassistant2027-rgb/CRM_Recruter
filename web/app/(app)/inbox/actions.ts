'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, decryptToken, googleFetch, googleSession, revokeToken, type GoogleSession } from '@/lib/google';
import {
  bodyOf,
  decodeEntities,
  buildRawEmail,
  emailsIn,
  fillTemplate,
  findPlaceholders,
  firstNameOf,
  headerOf,
  htmlToText,
  stripQuoted,
  textToHtml,
  type TemplateVars,
} from '@/lib/email';
import type { FormState } from '@/lib/form-state';
import { formatInterviewDate, formatTime } from '@/lib/time';

type Supa = Awaited<ReturnType<typeof createClient>>;
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

function googleError(e: unknown): string {
  if (e instanceof GoogleNotConnected) return e.message;
  return e instanceof Error ? e.message : 'Помилка Google';
}

// ---------------------------------------------------------------------
// Підключення
// ---------------------------------------------------------------------
export async function disconnectGoogle(): Promise<FormState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const admin = createAdminClient();
  const { data: account } = await admin.from('email_accounts').select('id, refresh_token_encrypted').eq('user_id', auth.user.id).maybeSingle();
  if (!account) return { ok: 'Google не підключено' };
  if (account.refresh_token_encrypted) {
    try {
      await revokeToken(decryptToken(account.refresh_token_encrypted));
    } catch {
      /* токен міг бути вже недійсним */
    }
  }
  await admin.from('email_accounts').update({ status: 'disconnected', refresh_token_encrypted: null }).eq('id', account.id);
  revalidatePath('/profile');
  return { ok: 'Google-акаунт відключено. Доступ CRM до пошти і календаря відкликано.' };
}

// ---------------------------------------------------------------------
// Підготовка листа: шаблон + змінні
// ---------------------------------------------------------------------
async function variablesFor(
  supabase: Supa,
  userId: string,
  candidateId: string,
  applicationId: string | null,
  interviewId: string | null = null,
): Promise<{ vars: TemplateVars; to: string | null; name: string } | null> {
  const [{ data: candidate }, { data: me }, { data: account }] = await Promise.all([
    supabase.from('candidates').select('full_name, email').eq('id', candidateId).maybeSingle(),
    supabase.from('profiles').select('full_name, phone, email').eq('id', userId).maybeSingle(),
    supabase.from('email_accounts').select('google_email, status').eq('user_id', userId).maybeSingle(),
  ]);
  if (!candidate) return null;
  let vacancyTitle: string | null = null;
  if (applicationId) {
    const { data: app } = await supabase.from('applications').select('vacancy_id').eq('id', applicationId).eq('candidate_id', candidateId).maybeSingle();
    if (app) {
      const { data: v } = await supabase.from('vacancies').select('title').eq('id', app.vacancy_id).maybeSingle();
      vacancyTitle = v?.title ?? null;
    }
  }
  let interviewVars: TemplateVars = {};
  if (interviewId) {
    const { data: iv } = await supabase.from('interviews').select('application_id, starts_at, location, meet_link').eq('id', interviewId).maybeSingle();
    if (iv) {
      interviewVars = {
        'interview.date': formatInterviewDate(iv.starts_at),
        'interview.time': formatTime(iv.starts_at),
        'interview.location': iv.location || (iv.meet_link ? `онлайн, Google Meet: ${iv.meet_link}` : null),
      };
      if (!vacancyTitle) {
        const { data: app } = await supabase.from('applications').select('vacancy_id').eq('id', iv.application_id).maybeSingle();
        const { data: v } = app ? await supabase.from('vacancies').select('title').eq('id', app.vacancy_id).maybeSingle() : { data: null };
        vacancyTitle = v?.title ?? null;
      }
    }
  }
  return {
    to: candidate.email,
    name: candidate.full_name,
    vars: {
      ...interviewVars,
      'candidate.first_name': firstNameOf(candidate.full_name),
      'candidate.full_name': candidate.full_name,
      'vacancy.title': vacancyTitle,
      'recruiter.name': me?.full_name,
      'recruiter.phone': me?.phone,
      'recruiter.email': account?.status === 'active' ? account.google_email : me?.email,
    },
  };
}

export async function prepareEmail(input: {
  candidateId: string;
  applicationId?: string | null;
  templateId?: string | null;
  interviewId?: string | null;
}): Promise<{
  error?: string;
  subject?: string;
  body?: string;
  missing?: string[];
}> {
  if (!uuidSchema.safeParse(input.candidateId).success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const ctx = await variablesFor(
    supabase,
    auth.user.id,
    input.candidateId,
    input.applicationId && uuidSchema.safeParse(input.applicationId).success ? input.applicationId : null,
    input.interviewId && uuidSchema.safeParse(input.interviewId).success ? input.interviewId : null,
  );
  if (!ctx) return { error: 'Кандидата не знайдено' };
  if (!input.templateId) return { subject: '', body: `Добрий день, ${ctx.vars['candidate.first_name']}!\n\n\n\nЗ повагою,\n${ctx.vars['recruiter.name'] ?? ''}`, missing: [] };
  if (!uuidSchema.safeParse(input.templateId).success) return { error: 'Невірний шаблон' };
  const { data: t } = await supabase.from('email_templates').select('subject, body_html').eq('id', input.templateId).maybeSingle();
  if (!t) return { error: 'Шаблон не знайдено' };
  const subject = fillTemplate(t.subject, ctx.vars);
  const body = fillTemplate(htmlToText(t.body_html), ctx.vars);
  return { subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])] };
}

// ---------------------------------------------------------------------
// Надсилання
// ---------------------------------------------------------------------
export async function sendEmail(input: {
  candidateId: string;
  applicationId?: string | null;
  templateId?: string | null;
  subject: string;
  body: string;
}): Promise<FormState> {
  if (!uuidSchema.safeParse(input.candidateId).success) return { error: 'Невірний кандидат' };
  const applicationId = input.applicationId && uuidSchema.safeParse(input.applicationId).success ? input.applicationId : null;
  const templateId = input.templateId && uuidSchema.safeParse(input.templateId).success ? input.templateId : null;
  const subject = input.subject.trim().slice(0, 300);
  const text = input.body.replace(/\r/g, '').trim().slice(0, 50_000);
  if (!subject) return { error: 'Вкажіть тему листа' };
  if (!text) return { error: 'Лист порожній' };
  const leftovers = findPlaceholders(`${subject}\n${text}`);
  if (leftovers.length) return { error: `Заповніть у тексті: ${leftovers.map((l) => `[${l}]`).join(', ')}` };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const { data: candidate } = await supabase.from('candidates').select('email, full_name').eq('id', input.candidateId).maybeSingle();
  if (!candidate) return { error: 'Кандидата не знайдено' };
  if (!candidate.email) return { error: 'У картці кандидата немає email' };

  let session: GoogleSession;
  try {
    session = await googleSession(auth.user.id);
  } catch (e) {
    return { error: googleError(e) };
  }
  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle();
  const html = textToHtml(text);

  // Запис у журнал листування від імені користувача — тут база перевіряє право email.send і доступ до кандидата
  const messageId = crypto.randomUUID();
  const { error: insertError } = await supabase.from('email_messages').insert({
    id: messageId,
    candidate_id: input.candidateId,
    application_id: applicationId,
    account_id: session.accountId,
    direction: 'out',
    from_email: session.email,
    to_emails: [candidate.email],
    subject,
    body_html: html,
    body_text: text,
    snippet: text.slice(0, 200),
    status: 'queued',
    template_id: templateId,
  });
  if (insertError) return { error: translateError(insertError) };

  const admin = createAdminClient();
  try {
    const raw = buildRawEmail({ fromEmail: session.email, fromName: me?.full_name, to: candidate.email, subject, text, html });
    const sent = await googleFetch<{ id: string; threadId: string }>(session, `${GMAIL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    await admin
      .from('email_messages')
      .update({ status: 'sent', gmail_message_id: sent.id, gmail_thread_id: sent.threadId, sent_at: new Date().toISOString() })
      .eq('id', messageId);
  } catch (e) {
    await admin.from('email_messages').update({ status: 'failed', error: googleError(e).slice(0, 500) }).eq('id', messageId);
    revalidatePath(`/candidates/${input.candidateId}`);
    return { error: `Лист не надіслано: ${googleError(e)}` };
  }
  await supabase.rpc('log_event', { p_action: 'email_sent', p_entity: 'email_messages', p_entity_id: messageId, p_details: { template_id: templateId } });
  revalidatePath(`/candidates/${input.candidateId}`);
  revalidatePath('/inbox');
  return { ok: `Лист надіслано на ${candidate.email}` };
}

// ---------------------------------------------------------------------
// Отримання листування з Gmail
// ---------------------------------------------------------------------
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload: Parameters<typeof headerOf>[0];
};

async function storeGmailMessages(
  session: GoogleSession,
  ids: string[],
  candidateByEmail: Map<string, string>,
): Promise<number> {
  if (!ids.length) return 0;
  const admin = createAdminClient();
  const { data: known } = await admin.from('email_messages').select('gmail_message_id').in('gmail_message_id', ids);
  const knownIds = new Set(((known ?? []) as { gmail_message_id: string }[]).map((k) => k.gmail_message_id));
  let saved = 0;
  for (const id of ids.filter((i) => !knownIds.has(i)).slice(0, 50)) {
    const msg = await googleFetch<GmailMessage>(session, `${GMAIL}/messages/${id}?format=full`);
    const from = emailsIn(headerOf(msg.payload, 'From'))[0] ?? null;
    const to = emailsIn(headerOf(msg.payload, 'To'));
    const cc = emailsIn(headerOf(msg.payload, 'Cc'));
    const outgoing = from === session.email.toLowerCase();
    const candidateEmail = outgoing ? [...to, ...cc].find((e) => candidateByEmail.has(e)) : from && candidateByEmail.has(from) ? from : undefined;
    if (!candidateEmail) continue;
    const { text, html } = bodyOf(msg.payload);
    const plain = stripQuoted(text ?? (html ? htmlToText(html) : msg.snippet ?? '')).slice(0, 50_000);
    const at = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
    const { error } = await admin.from('email_messages').insert({
      candidate_id: candidateByEmail.get(candidateEmail),
      account_id: session.accountId,
      direction: outgoing ? 'out' : 'in',
      gmail_message_id: msg.id,
      gmail_thread_id: msg.threadId,
      rfc_message_id: headerOf(msg.payload, 'Message-ID') ?? null,
      from_email: from,
      to_emails: to,
      cc_emails: cc,
      subject: (headerOf(msg.payload, 'Subject') ?? '').slice(0, 500),
      body_text: plain,
      body_html: null, // HTML від сторонніх відправників не зберігаємо — показуємо лише текст
      snippet: (plain || decodeEntities(msg.snippet ?? '')).replace(/\s+/g, ' ').slice(0, 200),
      status: outgoing ? 'sent' : 'received',
      sent_by: null,
      sent_at: outgoing ? at : null,
      received_at: outgoing ? null : at,
    });
    if (!error) saved++;
  }
  await admin.from('email_accounts').update({ last_sync_at: new Date().toISOString(), last_error: null }).eq('id', session.accountId);
  return saved;
}

// Листування з одним кандидатом (кнопка «Оновити з Gmail» у картці)
export async function syncCandidateEmails(candidateId: string): Promise<FormState> {
  if (!uuidSchema.safeParse(candidateId).success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const { data: candidate } = await supabase.from('candidates').select('id, email').eq('id', candidateId).maybeSingle();
  if (!candidate) return { error: 'Кандидата не знайдено' };
  if (!candidate.email) return { error: 'У картці кандидата немає email' };
  try {
    const session = await googleSession(auth.user.id);
    const email = candidate.email.toLowerCase().replace(/[^a-z0-9@._%+-]/g, '');
    const list = await googleFetch<{ messages?: { id: string }[] }>(
      session,
      `${GMAIL}/messages?maxResults=30&q=${encodeURIComponent(`(from:${email} OR to:${email}) newer_than:2y`)}`,
    );
    const saved = await storeGmailMessages(session, (list.messages ?? []).map((m) => m.id), new Map([[email, candidate.id]]));
    revalidatePath(`/candidates/${candidateId}`);
    return { ok: saved ? `Нових листів: ${saved}` : 'Нових листів немає' };
  } catch (e) {
    return { error: googleError(e) };
  }
}

// Останні листи з поштової скриньки, що стосуються кандидатів з бази (кнопка в «Комунікаціях»)
export async function syncRecentEmails(): Promise<FormState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  try {
    const session = await googleSession(auth.user.id);
    const list = await googleFetch<{ messages?: { id: string }[] }>(session, `${GMAIL}/messages?maxResults=50&q=${encodeURIComponent('newer_than:14d -in:chats')}`);
    const ids = (list.messages ?? []).map((m) => m.id);
    if (!ids.length) return { ok: 'Нових листів немає' };

    // Адреси учасників листів -> кандидати, до яких користувач має доступ
    const admin = createAdminClient();
    const { data: known } = await admin.from('email_messages').select('gmail_message_id').in('gmail_message_id', ids);
    const knownIds = new Set(((known ?? []) as { gmail_message_id: string }[]).map((k) => k.gmail_message_id));
    const fresh = ids.filter((i) => !knownIds.has(i));
    const addresses = new Set<string>();
    for (const id of fresh) {
      const meta = await googleFetch<GmailMessage>(session, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc`);
      for (const h of ['From', 'To', 'Cc']) emailsIn(headerOf(meta.payload, h)).forEach((e) => addresses.add(e));
    }
    addresses.delete(session.email.toLowerCase());
    if (!addresses.size) return { ok: 'Нових листів від кандидатів немає' };
    const { data: candidates } = await supabase.from('candidates').select('id, email_norm').in('email_norm', [...addresses]).is('deleted_at', null);
    const map = new Map(((candidates ?? []) as { id: string; email_norm: string }[]).map((c) => [c.email_norm, c.id]));
    const saved = await storeGmailMessages(session, fresh, map);
    revalidatePath('/inbox');
    return { ok: saved ? `Нових листів від кандидатів: ${saved}` : 'Нових листів від кандидатів немає' };
  } catch (e) {
    return { error: googleError(e) };
  }
}
