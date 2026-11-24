import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { GoogleNotConnected, googleFetch, googleSession, type GoogleSession } from '@/lib/google';
import { KIND_LABELS } from '@/lib/interviews';
import { TZ } from '@/lib/time';

type Supa = Awaited<ReturnType<typeof createClient>>;
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type GEvent = {
  id: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[]; createRequest?: { status?: { statusCode?: string } } };
};

function meetOf(event: GEvent): string | null {
  return event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;
}

// Google створює посилання Meet асинхронно — чекаємо до ~8 секунд
export async function waitForMeetLink(session: GoogleSession, event: GEvent): Promise<string | null> {
  let link = meetOf(event);
  for (let i = 0; !link && i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const fresh = await googleFetch<GEvent>(session, `${CAL}/${encodeURIComponent(event.id)}?conferenceDataVersion=1`);
    link = meetOf(fresh);
    if (fresh.conferenceData?.createRequest?.status?.statusCode === 'failure') break;
  }
  return link;
}

// Додати Meet до наявної події (якщо при створенні посилання не з'явилось)
export async function ensureMeetLink(session: GoogleSession, eventId: string, requestId: string): Promise<string | null> {
  const current = await googleFetch<GEvent>(session, `${CAL}/${encodeURIComponent(eventId)}?conferenceDataVersion=1`);
  if (meetOf(current)) return meetOf(current);
  const patched = await googleFetch<GEvent>(session, `${CAL}/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conferenceData: { createRequest: { requestId: `${requestId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
  });
  return waitForMeetLink(session, patched);
}

// Подія в Google Календарі для вже створеного запису співбесіди/контакту в CRM
export async function createGoogleEvent(
  supabase: Supa,
  userId: string,
  interviewId: string,
  opts: { meet: boolean; inviteCandidate: boolean },
): Promise<{ error?: string; warning?: string; invited?: boolean }> {
  const { data: iv } = await supabase
    .from('interviews')
    .select('id, application_id, kind, starts_at, ends_at, location')
    .eq('id', interviewId)
    .maybeSingle();
  if (!iv) return { error: 'Подію не знайдено' };
  const { data: app } = await supabase.from('applications').select('candidate_id, vacancy_id').eq('id', iv.application_id).maybeSingle();
  if (!app) return { error: 'Відгук не знайдено' };
  const [{ data: candidate }, { data: vacancy }] = await Promise.all([
    supabase.from('candidates').select('full_name, email, phone').eq('id', app.candidate_id).maybeSingle(),
    supabase.from('vacancies').select('title').eq('id', app.vacancy_id).maybeSingle(),
  ]);
  if (!candidate || !vacancy) return { error: 'Немає доступу до кандидата' };

  try {
    const session = await googleSession(userId);
    const invite = opts.inviteCandidate && Boolean(candidate.email);
    const event = await googleFetch<GEvent>(session, `${CAL}?sendUpdates=${invite ? 'all' : 'none'}&conferenceDataVersion=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `${KIND_LABELS[iv.kind] ?? 'Контакт'}: ${candidate.full_name} — ${vacancy.title}`,
        description: [`Кандидат: ${candidate.full_name}`, candidate.phone ? `Телефон: ${candidate.phone}` : '', `Вакансія: ${vacancy.title}`].filter(Boolean).join('\n'),
        location: iv.location ?? undefined,
        start: { dateTime: iv.starts_at, timeZone: TZ },
        end: { dateTime: iv.ends_at, timeZone: TZ },
        attendees: invite ? [{ email: candidate.email, displayName: candidate.full_name }] : [],
        guestsCanSeeOtherGuests: false,
        reminders: { useDefault: true },
        ...(opts.meet ? { conferenceData: { createRequest: { requestId: iv.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
      }),
    });
    const meetLink = opts.meet ? await waitForMeetLink(session, event) : null;
    await supabase.from('interviews').update({ google_event_id: event.id, meet_link: meetLink, calendar_id: 'primary' }).eq('id', iv.id);
    await supabase.from('interview_participants').insert([
      { interview_id: iv.id, user_id: userId, email: session.email, display_name: 'Організатор', response_status: 'accepted' },
      ...(invite ? [{ interview_id: iv.id, email: candidate.email, display_name: `${candidate.full_name} (кандидат)` }] : []),
    ]);
    if (opts.meet && !meetLink) return { invited: invite, warning: 'Google ще не видав посилання Meet — через хвилину натисніть «Оновити з календаря» біля співбесіди в картці кандидата.' };
    return { invited: invite };
  } catch (e) {
    return { error: e instanceof GoogleNotConnected ? e.message : e instanceof Error ? e.message : 'Помилка Google' };
  }
}
