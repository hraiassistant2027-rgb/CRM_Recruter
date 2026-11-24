import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { translateError } from '@/lib/errors';

type Supa = Awaited<ReturnType<typeof createClient>>;

// Додавання кандидата у відбір на вакансію (перший робочий етап воронки).
// Права перевіряє база (RLS applications).
export async function insertApplication(
  supabase: Supa,
  vacancyId: string,
  candidateId: string,
): Promise<{ error?: string; ok?: string; vacancyTitle?: string }> {
  const [{ data: vacancy }, { data: candidate }, { data: auth }] = await Promise.all([
    supabase.from('vacancies').select('id, title, pipeline_id, recruiter_id, status').eq('id', vacancyId).maybeSingle(),
    supabase.from('candidates').select('id, full_name, source_id').eq('id', candidateId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!vacancy) return { error: 'Вакансію не знайдено' };
  if (!candidate) return { error: 'Кандидата не знайдено' };
  if (!['open', 'on_hold', 'draft'].includes(vacancy.status)) return { error: 'Вакансія закрита — спершу відкрийте її знову' };

  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', vacancy.pipeline_id)
    .eq('is_active', true)
    .eq('kind', 'open')
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  if (!firstStage) return { error: 'У воронці немає активних етапів' };

  const { error } = await supabase.from('applications').insert({
    candidate_id: candidate.id,
    vacancy_id: vacancy.id,
    recruiter_id: vacancy.recruiter_id ?? auth.user?.id ?? null,
    stage_id: firstStage.id,
    source_id: candidate.source_id,
  });
  if (error) {
    if (error.code === '23505') return { error: `${candidate.full_name} вже бере участь у відборі на цю вакансію` };
    return { error: translateError(error) };
  }
  return { ok: `${candidate.full_name} → «${vacancy.title}»`, vacancyTitle: vacancy.title };
}
