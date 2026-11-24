import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { GoogleNotConnected, googleFetch, googleSession } from '@/lib/google';
import { KIND_LABELS } from '@/lib/interviews';
import { TZ } from '@/lib/time';

type Supa = Awaited<ReturnType<typeof createClient>>;
const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Подія в Google Календарі для вже створеного запису співбесіди/контакту в CRM
export async function createGoogleEvent(
  supabase: Supa,
  userId: string,
  interviewId: string,
  opts: { meet: boolean; inviteCandidate: boolean },
): Promise<{ error?: string; invited?: boolean }> {
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
    const event = await googleFetch<{ id: string; hangoutLink?: string }>(session, `${CAL}?sendUpdates=${invite ? 'all' : 'none'}&conferenceDataVersion=1`, {
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
    await supabase.from('interviews').update({ google_event_id: event.id, meet_link: event.hangoutLink ?? null, calendar_id: 'primary' }).eq('id', iv.id);
    await supabase.from('interview_participants').insert([
      { interview_id: iv.id, user_id: userId, email: session.email, display_name: 'Організатор', response_status: 'accepted' },
      ...(invite ? [{ interview_id: iv.id, email: candidate.email, display_name: `${candidate.full_name} (кандидат)` }] : []),
    ]);
    return { invited: invite };
  } catch (e) {
    return { error: e instanceof GoogleNotConnected ? e.message : e instanceof Error ? e.message : 'Помилка Google' };
  }
}
