'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, googleFetch, googleSession } from '@/lib/google';
import { buildRawEmail, textToHtml } from '@/lib/email';
import { formatInterviewDate, formatTime } from '@/lib/time';
import type { FormState } from '@/lib/form-state';

// Чернетка листа кадровику з даними для оформлення кандидата
const DOCS: Record<string, string> = { passed: 'пройдено', pending: 'очікую' };
const APPROVAL: Record<string, string> = { signed: 'підписано', pending: 'очікую підписання' };

// Чернетка листа кадровику з даними для оформлення кандидата
export async function prepareHrHandoff(applicationId: string, hrContactId: string): Promise<{ error?: string; to?: string; subject?: string; body?: string }> {
  if (!uuidSchema.safeParse(applicationId).success || !uuidSchema.safeParse(hrContactId).success) return { error: 'Оберіть кадровика' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const { data: app } = await supabase
    .from('applications')
    .select('id, candidate_id, vacancy_id, hr_docs_status, hr_approval_status')
    .eq('id', applicationId)
    .maybeSingle();
  if (!app) return { error: 'Відгук не знайдено' };
  const [{ data: hr }, { data: c }, { data: v }, { data: events }, { data: me }] = await Promise.all([
    supabase.from('hr_contacts').select('name, email').eq('id', hrContactId).maybeSingle(),
    supabase.from('candidates').select('full_name, phone, email').eq('id', app.candidate_id).maybeSingle(),
    supabase.from('vacancies').select('title, site_id').eq('id', app.vacancy_id).maybeSingle(),
    supabase.from('interviews').select('kind, starts_at, location, status').eq('application_id', app.id).in('kind', ['offer', 'polygraph']).neq('status', 'cancelled').order('starts_at', { ascending: false }),
    supabase.from('profiles').select('full_name, phone').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (!hr) return { error: 'Кадровика не знайдено' };
  if (!c || !v) return { error: 'Немає доступу до кандидата' };
  const { data: site } = v.site_id ? await supabase.from('sites').select('name, address').eq('id', v.site_id).maybeSingle() : { data: null };
  const list = (events ?? []) as { kind: string; starts_at: string; location: string | null; status: string }[];
  const offer = list.find((e) => e.kind === 'offer');
  const polygraph = list.find((e) => e.kind === 'polygraph');

  const offerDate = offer ? `${formatInterviewDate(offer.starts_at)}, ${formatTime(offer.starts_at)}` : '[дату оформлення не призначено]';
  const polygraphText = !polygraph
    ? 'не призначено'
    : polygraph.status === 'done'
      ? 'пройдено'
      : polygraph.status === 'no_show'
        ? 'кандидат не з’явився'
        : `заплановано на ${formatInterviewDate(polygraph.starts_at)}, ${formatTime(polygraph.starts_at)}`;

  const lines = [
    `Вітаю, ${hr.name}!`,
    '',
    `На ${offerDate} — оформлення кандидата:`,
    `${c.full_name}, ${v.title}`,
    site ? `Об'єкт: ${site.name}${site.address ? `, ${site.address}` : ''}` : '',
    `Телефон: ${c.phone ?? '—'}${c.email ? `, email: ${c.email}` : ''}`,
    offer?.location ? `Місце оформлення: ${offer.location}` : '',
    '',
    'Статуси:',
    `Перевірка документів — ${DOCS[app.hr_docs_status] ?? 'очікую'}`,
    `Перевірка поліграф — ${polygraphText}`,
    `Лист погодження — ${APPROVAL[app.hr_approval_status] ?? 'очікую підписання'}`,
    '',
    `Рекрутер: ${me?.full_name ?? ''}${me?.phone ? `, ${me.phone}` : ''}`,
  ].filter((l, i, arr) => l !== '' || (arr[i - 1] ?? '') !== '');
  return {
    to: hr.email,
    subject: `Оформлення: ${c.full_name} — ${v.title}${offer ? `, ${formatInterviewDate(offer.starts_at)}` : ''}`,
    body: lines.join('\n'),
  };
}

export async function setHrStatus(applicationId: string, field: 'hr_docs_status' | 'hr_approval_status', value: string): Promise<FormState> {
  if (!uuidSchema.safeParse(applicationId).success) return { error: 'Невірний відгук' };
  const allowed = field === 'hr_docs_status' ? ['pending', 'passed'] : field === 'hr_approval_status' ? ['pending', 'signed'] : [];
  if (!allowed.includes(value)) return { error: 'Невірний статус' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('applications').update({ [field]: value }).eq('id', applicationId).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права змінювати цей відгук' };
  revalidatePath('/');
  return { ok: 'Збережено' };
}

export async function sendHrHandoff(input: { applicationId: string; hrContactId: string; subject: string; body: string }): Promise<FormState> {
  if (!uuidSchema.safeParse(input.applicationId).success || !uuidSchema.safeParse(input.hrContactId).success) return { error: 'Оберіть кадровика' };
  const subject = input.subject.trim().slice(0, 300);
  const text = input.body.replace(/\r/g, '').trim().slice(0, 20_000);
  if (!subject || !text) return { error: 'Лист порожній' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const [{ data: hr }, { data: app }, { data: me }] = await Promise.all([
    supabase.from('hr_contacts').select('email').eq('id', input.hrContactId).maybeSingle(),
    supabase.from('applications').select('id').eq('id', input.applicationId).maybeSingle(),
    supabase.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (!hr) return { error: 'Кадровика не знайдено' };
  if (!app) return { error: 'Відгук не знайдено' };

  let gmailId: string | null = null;
  try {
    const session = await googleSession(auth.user.id);
    const raw = buildRawEmail({ fromEmail: session.email, fromName: me?.full_name, to: hr.email, subject, text, html: textToHtml(text) });
    const sent = await googleFetch<{ id: string }>(session, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    gmailId = sent.id;
  } catch (e) {
    return { error: e instanceof GoogleNotConnected ? e.message : `Лист не надіслано: ${e instanceof Error ? e.message : ''}` };
  }
  const { error } = await supabase.from('hr_handoffs').insert({
    application_id: input.applicationId,
    hr_contact_id: input.hrContactId,
    hr_email: hr.email,
    subject,
    body_text: text,
    gmail_message_id: gmailId,
  });
  if (error) return { error: `Лист надіслано, але не записано в журнал: ${translateError(error)}` };
  revalidatePath('/');
  return { ok: `Надіслано кадровику ${hr.email}` };
}
