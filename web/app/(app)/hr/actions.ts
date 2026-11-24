'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, googleFetch, googleSession } from '@/lib/google';
import { buildRawEmail, textToHtml } from '@/lib/email';
import { formatInterviewDate, formatTime } from '@/lib/time';
import { formatSalary } from '@/lib/candidates';
import type { FormState } from '@/lib/form-state';

// Чернетка листа кадровику з даними для оформлення кандидата
export async function prepareHrHandoff(applicationId: string, hrContactId: string): Promise<{ error?: string; to?: string; subject?: string; body?: string }> {
  if (!uuidSchema.safeParse(applicationId).success || !uuidSchema.safeParse(hrContactId).success) return { error: 'Оберіть кадровика' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const { data: app } = await supabase.from('applications').select('id, candidate_id, vacancy_id, recruiter_id').eq('id', applicationId).maybeSingle();
  if (!app) return { error: 'Відгук не знайдено' };
  const [{ data: hr }, { data: c }, { data: v }, { data: offer }, { data: me }] = await Promise.all([
    supabase.from('hr_contacts').select('name, email').eq('id', hrContactId).maybeSingle(),
    supabase.from('candidates').select('full_name, phone, email, city, desired_salary, salary_currency').eq('id', app.candidate_id).maybeSingle(),
    supabase.from('vacancies').select('title, site_id, salary_min, salary_max, salary_currency').eq('id', app.vacancy_id).maybeSingle(),
    supabase.from('interviews').select('starts_at, location').eq('application_id', app.id).eq('kind', 'offer').neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('profiles').select('full_name, phone').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (!hr) return { error: 'Кадровика не знайдено' };
  if (!c || !v) return { error: 'Немає доступу до кандидата' };
  const { data: site } = v.site_id ? await supabase.from('sites').select('name, address').eq('id', v.site_id).maybeSingle() : { data: null };

  const when = offer ? `${formatInterviewDate(offer.starts_at)}, ${formatTime(offer.starts_at)}` : 'дату ще не призначено';
  const lines = [
    `Добрий день, ${hr.name}!`,
    '',
    'Прошу підготувати оформлення кандидата:',
    `ПІБ: ${c.full_name}`,
    `Посада: ${v.title}`,
    site ? `Об'єкт: ${site.name}${site.address ? `, ${site.address}` : ''}` : '',
    `Телефон: ${c.phone ?? '—'}`,
    `Email: ${c.email ?? '—'}`,
    c.city ? `Місто: ${c.city}` : '',
    `Запрошення на оформлення: ${when}`,
    offer?.location ? `Місце: ${offer.location}` : '',
    c.desired_salary != null ? `Бажана зарплата кандидата: ${formatSalary(c.desired_salary, c.salary_currency)}` : '',
    '',
    `Рекрутер: ${me?.full_name ?? ''}${me?.phone ? `, ${me.phone}` : ''}`,
    '',
    'Дякую!',
  ].filter((l, i, arr) => l !== '' || (arr[i - 1] ?? '') !== '');
  return {
    to: hr.email,
    subject: `Оформлення кандидата: ${c.full_name} — ${v.title}${offer ? `, ${formatInterviewDate(offer.starts_at)}` : ''}`,
    body: lines.join('\n'),
  };
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
