'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, googleFetch, googleSession } from '@/lib/google';
import { buildRawEmail, textToHtml } from '@/lib/email';
import { formatInterviewDate, formatTime } from '@/lib/time';
import type { FormState } from '@/lib/form-state';

export type ItFields = { pc_type: string; company: string; room: string; accesses: string; manager: string };

const clip = (v: unknown, n: number) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, n) : null;
};

function readFields(f: ItFields) {
  return {
    pc_type: clip(f.pc_type, 100),
    company: clip(f.company, 200),
    room: clip(f.room, 200),
    accesses: clip(f.accesses, 2000),
    manager: clip(f.manager, 200),
  };
}

async function save(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string, fields: ItFields) {
  const row = { application_id: applicationId, ...readFields(fields) };
  const { data, error } = await supabase.from('it_requests').upsert(row, { onConflict: 'application_id' }).select('application_id');
  if (error) return translateError(error);
  if (!data?.length) return 'Немає права змінювати цього кандидата';
  return null;
}

export async function saveItRequest(applicationId: string, fields: ItFields): Promise<FormState> {
  if (!uuidSchema.safeParse(applicationId).success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const err = await save(supabase, applicationId, fields);
  if (err) return { error: err };
  revalidatePath('/');
  return { ok: 'Збережено' };
}

// Зберегти і надіслати лист «Підготовка робочого місця» всім активним системним адміністраторам простору
export async function sendItRequest(applicationId: string, fields: ItFields): Promise<FormState> {
  if (!uuidSchema.safeParse(applicationId).success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };

  const err = await save(supabase, applicationId, fields);
  if (err) return { error: err };

  const [{ data: app }, { data: it }, { data: me }] = await Promise.all([
    supabase.from('applications').select('id, candidate_id, vacancy_id').eq('id', applicationId).maybeSingle(),
    supabase.from('it_contacts').select('email').eq('is_active', true),
    supabase.from('profiles').select('full_name, phone').eq('id', auth.user.id).maybeSingle(),
  ]);
  if (!app) return { error: 'Кандидата не знайдено' };
  const to = [...new Set(((it ?? []) as { email: string }[]).map((x) => x.email.toLowerCase()))];
  if (!to.length) return { error: 'Не вказано email системного адміністратора: Налаштування → Довідники → Системні адміністратори (IT)' };

  const [{ data: c }, { data: v }, { data: offer }] = await Promise.all([
    supabase.from('candidates').select('full_name, phone').eq('id', app.candidate_id).maybeSingle(),
    supabase.from('vacancies').select('title').eq('id', app.vacancy_id).maybeSingle(),
    supabase.from('interviews').select('starts_at').eq('application_id', app.id).eq('kind', 'offer').neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!c || !v) return { error: 'Немає доступу до кандидата' };
  const f = readFields(fields);
  const date = offer ? `${formatInterviewDate(offer.starts_at)}, ${formatTime(offer.starts_at)}` : 'ще не призначено';
  const lines = [
    'Вітаю!',
    '',
    'Прошу підготувати робоче місце для нового співробітника.',
    '',
    `Дата оформлення: ${date}`,
    `ПІБ: ${c.full_name}`,
    `Посада: ${v.title}`,
    `Телефон кандидата: ${c.phone ?? '—'}`,
    `Тип робочого ПК: ${f.pc_type ?? '—'}`,
    `В яку компанію оформлений: ${f.company ?? '—'}`,
    `Кабінет (робоче місце): ${f.room ?? '—'}`,
    `Доступи: ${f.accesses ?? 'про доступи та характеристики уточнити у безпосереднього керівника'}`,
    `Безпосередній керівник: ${f.manager ?? '—'}`,
    '',
    `Рекрутер: ${me?.full_name ?? ''}${me?.phone ? `, ${me.phone}` : ''}`,
  ];
  const text = lines.join('\n');
  const subject = `Підготовка робочого місця: ${c.full_name} — ${v.title}${offer ? `, ${formatInterviewDate(offer.starts_at)}` : ''}`;

  let gmailId: string | null = null;
  try {
    const session = await googleSession(auth.user.id);
    const raw = buildRawEmail({ fromEmail: session.email, fromName: me?.full_name, to: to.join(', '), subject, text, html: textToHtml(text) });
    const sent = await googleFetch<{ id: string }>(session, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    gmailId = sent.id;
  } catch (e) {
    return { error: e instanceof GoogleNotConnected ? e.message : `Лист не надіслано: ${e instanceof Error ? e.message : ''}` };
  }
  const { error } = await supabase
    .from('it_requests')
    .update({ sent_at: new Date().toISOString(), sent_to: to.join(', '), sent_by: auth.user.id, gmail_message_id: gmailId })
    .eq('application_id', applicationId);
  if (error) return { error: `Лист надіслано, але не записано: ${translateError(error)}` };
  revalidatePath('/');
  return { ok: `Надіслано в IT: ${to.join(', ')}` };
}
