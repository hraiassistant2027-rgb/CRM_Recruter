import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { INTERVIEW_COLUMNS, type InterviewRow } from '@/lib/interviews';

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AgendaItem = InterviewRow & { candidate_id: string | null; candidate_name: string; vacancy_title: string };

// Співбесіди за період (права перевіряє база). mineFor — лише ті, де користувач організатор або учасник.
export async function loadAgenda(supabase: Supa, fromIso: string, toIso: string, mineFor?: string): Promise<AgendaItem[]> {
  let query = supabase
    .from('interviews')
    .select(`${INTERVIEW_COLUMNS}, applications(candidate_id, candidates(full_name), vacancies(title))`)
    .gte('starts_at', fromIso)
    .lt('starts_at', toIso)
    .neq('status', 'cancelled')
    .order('starts_at')
    .limit(500);
  if (mineFor) {
    const { data: part } = await supabase.from('interview_participants').select('interview_id').eq('user_id', mineFor);
    const ids = [...new Set(((part ?? []) as { interview_id: string }[]).map((p) => p.interview_id))];
    query = ids.length ? query.or(`organizer_id.eq.${mineFor},id.in.(${ids.join(',')})`) : query.eq('organizer_id', mineFor);
  }
  const { data } = await query;
  type Row = InterviewRow & {
    applications:
      | { candidate_id: string; candidates: { full_name: string } | { full_name: string }[] | null; vacancies: { title: string } | { title: string }[] | null }
      | null;
  };
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  return ((data ?? []) as unknown as Row[]).map(({ applications, ...iv }) => ({
    ...iv,
    candidate_id: applications?.candidate_id ?? null,
    candidate_name: one(applications?.candidates)?.full_name ?? 'Кандидат',
    vacancy_title: one(applications?.vacancies)?.title ?? '',
  }));
}
