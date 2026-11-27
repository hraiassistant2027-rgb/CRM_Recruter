'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { noteSchema, uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, googleFetch, googleSession, type GoogleSession } from '@/lib/google';
import { kyivToDate, TZ } from '@/lib/time';
import type { FormState } from '@/lib/form-state';
import { KIND_LABELS } from '@/lib/interviews';
import { CANDIDATE_MAIL_BLOCKED } from '@/lib/candidate-mail';
import { ensureMeetLink, waitForMeetLink } from '@/lib/calendar-events';

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';


function gErr(e: unknown): string {
  if (e instanceof GoogleNotConnected) return e.message;
  return e instanceof Error ? e.message : 'Помилка Google';
}

function revalidateAll(candidateId?: string) {
  revalidatePath('/calendar');
  revalidatePath('/');
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
}

const scheduleSchema = z.object({
  application_id: uuidSchema,
  kind: z.enum(['phone', 'manager', 'repeat', 'other']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Вкажіть дату'),
  time: z.string().regex(/^\d{1,2}:\d{2}$/, 'Вкажіть час'),
  duration: z.coerce.number().int().min(10, 'Мінімум 10 хвилин').max(480, 'Максимум 8 годин'),
  location: z.string().trim().max(300, 'Задовга адреса'),
  meet: z.boolean(),
  invite_candidate: z.boolean(),
  participant_ids: z.array(uuidSchema).max(20),
  extra_emails: z.string().max(1000),
  note: z.string().trim().max(2000),
});

type Attendee = { email: string; displayName?: string; responseStatus?: string };

export async function scheduleInterview(formData: FormData): Promise<FormState & { interviewId?: string }> {
  const parsed = scheduleSchema.safeParse({
    application_id: formData.get('application_id'),
    kind: formData.get('kind'),
    date: formData.get('date'),
    time: formData.get('time'),
    duration: formData.get('duration'),
    location: formData.get('location') ?? '',
    meet: formData.get('meet') === 'on',
    invite_candidate: formData.get('invite_candidate') === 'on',
    participant_ids: formData.getAll('participant_ids').map(String),
    extra_emails: formData.get('extra_emails') ?? '',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте дані' };
  const v = parsed.data;
  const start = kyivToDate(v.date, v.time);
  if (!start) return { error: 'Невірна дата або час' };
  if (start.getTime() < Date.now() - 5 * 60_000) return { error: 'Час співбесіди вже минув' };
  const end = new Date(start.getTime() + v.duration * 60_000);
  if (!v.meet && !v.location) return { error: 'Вкажіть місце співбесіди або оберіть Google Meet' };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  const { data: app } = await supabase.from('applications').select('id, candidate_id, vacancy_id').eq('id', v.application_id).maybeSingle();
  if (!app) return { error: 'Відгук не знайдено' };
  const [{ data: candidate }, { data: vacancy }, { data: users }] = await Promise.all([
    supabase.from('candidates').select('full_name, email, phone').eq('id', app.candidate_id).maybeSingle(),
    supabase.from('vacancies').select('title').eq('id', app.vacancy_id).maybeSingle(),
    v.participant_ids.length ? supabase.from('profiles').select('id, full_name, email').in('id', v.participant_ids) : Promise.resolve({ data: [] }),
  ]);
  if (!candidate || !vacancy) return { error: 'Немає доступу до кандидата або вакансії' };
  if (v.invite_candidate && !candidate.email) return { error: 'У картці кандидата немає email — зніміть галочку «Надіслати запрошення кандидату» або додайте email' };

  let session: GoogleSession;
  try {
    session = await googleSession(auth.user.id);
  } catch (e) {
    return { error: gErr(e) };
  }

  // Запис у CRM від імені користувача — права перевіряє база
  const interviewId = randomUUID();
  const { error: insertError } = await supabase.from('interviews').insert({
    id: interviewId,
    application_id: app.id,
    kind: v.kind,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    location: v.location || null,
    calendar_id: 'primary',
    status: 'scheduled',
  });
  if (insertError) return { error: translateError(insertError) };

  const extra = [...new Set(v.extra_emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0, 20);
  const profileRows = (users ?? []) as { id: string; full_name: string; email: string }[];
  const attendees: Attendee[] = [
    ...(v.invite_candidate && !CANDIDATE_MAIL_BLOCKED && candidate.email ? [{ email: candidate.email, displayName: candidate.full_name }] : []),
    ...profileRows.filter((u) => u.email && u.email.toLowerCase() !== session.email.toLowerCase()).map((u) => ({ email: u.email, displayName: u.full_name })),
    ...extra.map((email) => ({ email })),
  ];
  const description = [
    `Кандидат: ${candidate.full_name}`,
    candidate.phone ? `Телефон кандидата: ${candidate.phone}` : '',
    `Вакансія: ${vacancy.title}`,
    v.note,
  ]
    .filter(Boolean)
    .join('\n');

  const admin = createAdminClient();
  try {
    const event = await googleFetch<{ id: string; hangoutLink?: string }>(
      session,
      `${CAL}?sendUpdates=all&conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `${KIND_LABELS[v.kind]}: ${candidate.full_name} — ${vacancy.title}`,
          description,
          location: v.location || undefined,
          start: { dateTime: start.toISOString(), timeZone: TZ },
          end: { dateTime: end.toISOString(), timeZone: TZ },
          attendees,
          guestsCanSeeOtherGuests: false,
          reminders: { useDefault: true },
          ...(v.meet ? { conferenceData: { createRequest: { requestId: interviewId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
        }),
      },
    );
    const meetLink = v.meet ? await waitForMeetLink(session, event) : null;
    await supabase.from('interviews').update({ google_event_id: event.id, meet_link: meetLink }).eq('id', interviewId);
  } catch (e) {
    await admin.from('interviews').delete().eq('id', interviewId);
    return { error: `Подію в календарі не створено: ${gErr(e)}` };
  }

  const participants = [
    ...(v.invite_candidate && !CANDIDATE_MAIL_BLOCKED && candidate.email ? [{ interview_id: interviewId, email: candidate.email, display_name: `${candidate.full_name} (кандидат)` }] : []),
    { interview_id: interviewId, user_id: auth.user.id, email: session.email, display_name: 'Організатор', response_status: 'accepted' },
    ...profileRows.filter((u) => u.id !== auth.user!.id).map((u) => ({ interview_id: interviewId, user_id: u.id, email: u.email, display_name: u.full_name })),
    ...extra.map((email) => ({ interview_id: interviewId, email, display_name: email })),
  ];
  await supabase.from('interview_participants').insert(participants);

  revalidateAll(app.candidate_id);
  return { ok: 'Співбесіду призначено, подію додано у ваш Google Календар, запрошення надіслано учасникам', interviewId };
}

// ---------------------------------------------------------------------
// Дії з наявною співбесідою: виконуються від імені організатора (подія в його календарі)
// ---------------------------------------------------------------------
async function loadInterview(id: string) {
  const supabase = await createClient();
  const { data: interview } = await supabase
    .from('interviews')
    .select('id, application_id, starts_at, ends_at, google_event_id, organizer_id, status, location, meet_link')
    .eq('id', id)
    .maybeSingle();
  if (!interview) return null;
  const { data: app } = await supabase.from('applications').select('candidate_id').eq('id', interview.application_id).maybeSingle();
  return { supabase, interview, candidateId: app?.candidate_id as string | undefined };
}

// Кому Google розсилає сповіщення про зміну події. Поки листи кандидатам вимкнено,
// а кандидат є гостем події (запрошений раніше) — не розсилаємо нікому, щоб лист не пішов кандидату.
async function sendUpdatesFor(ctx: NonNullable<Awaited<ReturnType<typeof loadInterview>>>): Promise<'all' | 'none'> {
  if (!CANDIDATE_MAIL_BLOCKED || !ctx.candidateId) return 'all';
  const [{ data: cand }, { data: parts }] = await Promise.all([
    ctx.supabase.from('candidates').select('email').eq('id', ctx.candidateId).maybeSingle(),
    ctx.supabase.from('interview_participants').select('email, display_name').eq('interview_id', ctx.interview.id),
  ]);
  const email = (cand?.email ?? '').toLowerCase();
  const invited = ((parts ?? []) as { email: string | null; display_name: string | null }[]).some(
    (p) => (email && p.email?.toLowerCase() === email) || /\(кандидат\)/.test(p.display_name ?? ''),
  );
  return invited ? 'none' : 'all';
}

export async function rescheduleInterview(formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірна співбесіда' };
  const start = kyivToDate(String(formData.get('date') ?? ''), String(formData.get('time') ?? ''));
  const duration = Number(formData.get('duration'));
  if (!start) return { error: 'Вкажіть дату і час' };
  if (!Number.isInteger(duration) || duration < 10 || duration > 480) return { error: 'Тривалість — від 10 до 480 хвилин' };
  if (start.getTime() < Date.now() - 5 * 60_000) return { error: 'Цей час уже минув' };
  const end = new Date(start.getTime() + duration * 60_000);
  const location = String(formData.get('location') ?? '').trim().slice(0, 300);

  const ctx = await loadInterview(id.data);
  if (!ctx) return { error: 'Співбесіду не знайдено' };
  // Спершу CRM (тут база перевіряє права), потім календар
  const { data, error } = await ctx.supabase
    .from('interviews')
    .update({ starts_at: start.toISOString(), ends_at: end.toISOString(), status: 'rescheduled', location: location || ctx.interview.location })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права змінювати цю співбесіду' };

  if (ctx.interview.google_event_id && ctx.interview.organizer_id) {
    try {
      const session = await googleSession(ctx.interview.organizer_id);
      await googleFetch(session, `${CAL}/${encodeURIComponent(ctx.interview.google_event_id)}?sendUpdates=${await sendUpdatesFor(ctx)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: { dateTime: start.toISOString(), timeZone: TZ },
          end: { dateTime: end.toISOString(), timeZone: TZ },
          ...(location ? { location } : {}),
        }),
      });
    } catch (e) {
      revalidateAll(ctx.candidateId);
      return { error: `У CRM перенесено, але календар не оновлено: ${gErr(e)}` };
    }
  }
  revalidateAll(ctx.candidateId);
  return { ok: 'Співбесіду перенесено, учасники отримали сповіщення' };
}

export async function cancelInterview(formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірна співбесіда' };
  const ctx = await loadInterview(id.data);
  if (!ctx) return { error: 'Співбесіду не знайдено' };
  const { data, error } = await ctx.supabase.from('interviews').update({ status: 'cancelled' }).eq('id', id.data).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права змінювати цю співбесіду' };

  if (ctx.interview.google_event_id && ctx.interview.organizer_id) {
    try {
      const session = await googleSession(ctx.interview.organizer_id);
      await googleFetch(session, `${CAL}/${encodeURIComponent(ctx.interview.google_event_id)}?sendUpdates=${await sendUpdatesFor(ctx)}`, { method: 'DELETE' });
    } catch (e) {
      const msg = gErr(e);
      if (!/410|404|deleted|Not Found/i.test(msg)) {
        revalidateAll(ctx.candidateId);
        return { error: `У CRM скасовано, але подію в календарі не видалено: ${msg}` };
      }
    }
  }
  revalidateAll(ctx.candidateId);
  return { ok: 'Співбесіду скасовано, учасники отримали сповіщення' };
}

export async function saveInterviewResult(formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірна співбесіда' };
  const status = String(formData.get('status'));
  if (!['done', 'no_show'].includes(status)) return { error: 'Оберіть результат' };
  const result = String(formData.get('result') ?? '').trim().slice(0, 200);
  const comment = String(formData.get('result_comment') ?? '').trim().slice(0, 2000);
  const ctx = await loadInterview(id.data);
  if (!ctx) return { error: 'Співбесіду не знайдено' };
  const { data, error } = await ctx.supabase
    .from('interviews')
    .update({ status, result: result || null, result_comment: comment || null })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права змінювати цю співбесіду' };
  revalidateAll(ctx.candidateId);
  return { ok: 'Результат збережено' };
}

// Відповіді учасників (прийняв/відхилив) з Google Календаря
export async function syncInterviewResponses(id: string): Promise<FormState> {
  if (!uuidSchema.safeParse(id).success) return { error: 'Невірна співбесіда' };
  const ctx = await loadInterview(id);
  if (!ctx?.interview.google_event_id || !ctx.interview.organizer_id) return { error: 'Подію в календарі не знайдено' };
  try {
    const session = await googleSession(ctx.interview.organizer_id);
    const event = await googleFetch<{ attendees?: Attendee[] }>(session, `${CAL}/${encodeURIComponent(ctx.interview.google_event_id)}`);
    // Онлайн-зустріч без посилання — створюємо або забираємо посилання Meet
    let meetNote = '';
    if (!ctx.interview.meet_link && /онлайн|meet/i.test(ctx.interview.location ?? '')) {
      const link = await ensureMeetLink(session, ctx.interview.google_event_id, id);
      if (link) {
        await ctx.supabase.from('interviews').update({ meet_link: link }).eq('id', id);
        meetNote = ' Посилання Google Meet додано.';
      }
    }
    const { data: participants } = await ctx.supabase.from('interview_participants').select('id, email').eq('interview_id', id);
    let changed = 0;
    for (const p of (participants ?? []) as { id: string; email: string | null }[]) {
      const a = (event.attendees ?? []).find((x) => x.email?.toLowerCase() === p.email?.toLowerCase());
      if (a?.responseStatus && ['needsAction', 'accepted', 'declined', 'tentative'].includes(a.responseStatus)) {
        const { error } = await ctx.supabase.from('interview_participants').update({ response_status: a.responseStatus }).eq('id', p.id);
        if (!error) changed++;
      }
    }
    revalidateAll(ctx.candidateId);
    return { ok: `${changed ? 'Відповіді учасників оновлено.' : 'Нових відповідей немає.'}${meetNote}` };
  } catch (e) {
    return { error: gErr(e) };
  }
}

// Нотатка до зустрічі (з календаря). Зберігається в нотатках кандидата з позначкою зустрічі.
export async function addInterviewNote(interviewId: string, body: string): Promise<FormState & { note?: { id: string; body: string; created_at: string } }> {
  if (!uuidSchema.safeParse(interviewId).success) return { error: 'Невірна зустріч' };
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте текст' };
  const ctx = await loadInterview(interviewId);
  if (!ctx?.candidateId) return { error: 'Зустріч не знайдено' };
  const { data, error } = await ctx.supabase
    .from('notes')
    .insert({ candidate_id: ctx.candidateId, application_id: ctx.interview.application_id, interview_id: interviewId, body: parsed.data.body })
    .select('id, body, created_at')
    .single();
  if (error) return { error: translateError(error) };
  revalidateAll(ctx.candidateId);
  return { ok: 'Нотатку збережено', note: data as { id: string; body: string; created_at: string } };
}
