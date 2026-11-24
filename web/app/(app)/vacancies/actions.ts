'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema, vacancySchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

export type VacancyFormState = FormState & { fieldErrors?: Record<string, string> };

const VACANCY_FIELDS = [
  'title', 'site_id', 'department_id', 'hiring_manager_name', 'hiring_manager_id', 'recruiter_id', 'headcount',
  'salary_min', 'salary_max', 'salary_currency', 'priority', 'status', 'opened_at', 'requirements',
] as const;

function readVacancy(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const key of VACANCY_FIELDS) raw[key] = String(formData.get(key) ?? '');
  return vacancySchema.safeParse(raw);
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function saveVacancy(_prev: VacancyFormState, formData: FormData): Promise<VacancyFormState> {
  const parsed = readVacancy(formData);
  if (!parsed.success) return { error: 'Перевірте виділені поля', fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const v = parsed.data;
  const existingId = String(formData.get('id') ?? '');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const row = {
    ...v,
    // Рекрутер за замовчуванням — той, хто створює вакансію (інакше рекрутер не зможе її редагувати)
    recruiter_id: v.recruiter_id ?? auth.user?.id ?? null,
    closed_at: ['closed', 'cancelled'].includes(v.status) ? new Date().toISOString().slice(0, 10) : null,
  };

  if (existingId) {
    if (!uuidSchema.safeParse(existingId).success) return { error: 'Невірна вакансія' };
    const { data: current } = await supabase.from('vacancies').select('closed_at, status').eq('id', existingId).maybeSingle();
    if (current?.closed_at && ['closed', 'cancelled'].includes(v.status)) row.closed_at = current.closed_at;
    const { data, error } = await supabase.from('vacancies').update(row).eq('id', existingId).select('id');
    if (error) return { error: translateError(error) };
    if (!data?.length) return { error: 'Немає права редагувати цю вакансію' };
    revalidatePath('/vacancies');
    redirect(`/vacancies/${existingId}?notice=saved`);
  }

  const { data: pipeline } = await supabase.from('pipelines').select('id').eq('is_default', true).maybeSingle();
  if (!pipeline) return { error: 'Не налаштовано воронку за замовчуванням' };
  const id = randomUUID();
  const { error } = await supabase.from('vacancies').insert({ id, ...row, pipeline_id: pipeline.id });
  if (error) return { error: translateError(error) };
  revalidatePath('/vacancies');
  redirect(`/vacancies/${id}?notice=created`);
}

// ---------------------------------------------------------------------
// Відгуки: додавання кандидата у вакансію і переміщення по етапах
// ---------------------------------------------------------------------
export async function addApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const vacancyId = uuidSchema.safeParse(formData.get('vacancy_id'));
  const candidateId = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!vacancyId.success) return { error: 'Оберіть вакансію' };
  if (!candidateId.success) return { error: 'Оберіть кандидата' };

  const supabase = await createClient();
  const [{ data: vacancy }, { data: candidate }, { data: auth }] = await Promise.all([
    supabase.from('vacancies').select('id, title, pipeline_id, recruiter_id, status').eq('id', vacancyId.data).maybeSingle(),
    supabase.from('candidates').select('id, full_name, source_id').eq('id', candidateId.data).maybeSingle(),
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
  revalidatePath(`/vacancies/${vacancy.id}`);
  revalidatePath(`/candidates/${candidate.id}`);
  revalidatePath('/pipeline');
  return { ok: `${candidate.full_name} → «${vacancy.title}»` };
}

export async function moveApplication(input: {
  applicationId: string;
  stageId: string;
  reasonId?: string | null;
  comment?: string | null;
}): Promise<FormState> {
  const ids = [input.applicationId, input.stageId, ...(input.reasonId ? [input.reasonId] : [])];
  if (!ids.every((v) => uuidSchema.safeParse(v).success)) return { error: 'Невірні дані' };
  const comment = (input.comment ?? '').trim().slice(0, 1000) || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc('move_application', {
    p_id: input.applicationId,
    p_stage_id: input.stageId,
    p_reason_id: input.reasonId ?? null,
    p_comment: comment,
  });
  if (error) return { error: translateError(error) };
  revalidatePath('/pipeline');
  revalidatePath('/vacancies', 'layout');
  revalidatePath('/candidates', 'layout');
  return { ok: 'Етап змінено' };
}

// Пошук кандидатів для додавання у вакансію (до 10 результатів)
export async function findCandidates(query: string): Promise<{ id: string; full_name: string; city: string | null; current_position: string | null }[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('search_candidates', { p_query: q, p_limit: 10 });
  return ((data ?? []) as { id: string; full_name: string; city: string | null; current_position: string | null }[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    city: r.city,
    current_position: r.current_position,
  }));
}
