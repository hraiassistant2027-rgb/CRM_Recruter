'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema, vacancySchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { insertApplication } from '@/lib/applications';
import { createGoogleEvent } from '@/lib/calendar-events';
import { kyivToDate } from '@/lib/time';
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
  const result = await insertApplication(supabase, vacancyId.data, candidateId.data);
  if (result.error) return { error: result.error };
  revalidatePath(`/vacancies/${vacancyId.data}`);
  revalidatePath(`/candidates/${candidateId.data}`);
  revalidatePath('/pipeline');
  return { ok: result.ok };
}

export type ContactInput = {
  date: string;
  time: string;
  duration: number;
  location?: string | null;
  meet?: boolean;
  google?: boolean;
  inviteCandidate?: boolean;
};

export async function moveApplication(input: {
  applicationId: string;
  stageId: string;
  reasonId?: string | null;
  comment?: string | null;
  contact?: ContactInput | null;
}): Promise<FormState> {
  const ids = [input.applicationId, input.stageId, ...(input.reasonId ? [input.reasonId] : [])];
  if (!ids.every((v) => uuidSchema.safeParse(v).success)) return { error: 'Невірні дані' };
  const comment = (input.comment ?? '').trim().slice(0, 1000) || null;

  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (input.contact) {
    startsAt = kyivToDate(input.contact.date, input.contact.time);
    const duration = Number(input.contact.duration);
    if (!startsAt) return { error: 'Вкажіть дату і час' };
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) return { error: 'Тривалість — від 5 до 480 хвилин' };
    endsAt = new Date(startsAt.getTime() + duration * 60_000);
  }

  const supabase = await createClient();
  const { data: interviewId, error } = await supabase.rpc('move_application', {
    p_id: input.applicationId,
    p_stage_id: input.stageId,
    p_reason_id: input.reasonId ?? null,
    p_comment: comment,
    p_starts_at: startsAt?.toISOString() ?? null,
    p_ends_at: endsAt?.toISOString() ?? null,
    p_location: input.contact?.location?.slice(0, 300) ?? null,
  });
  if (error) return { error: translateError(error) };

  let note = '';
  if (interviewId && input.contact?.google) {
    const { data: auth } = await supabase.auth.getUser();
    const r = await createGoogleEvent(supabase, auth.user!.id, interviewId as string, {
      meet: Boolean(input.contact.meet),
      inviteCandidate: Boolean(input.contact.inviteCandidate),
    });
    note = r.error ? ` Подію в Google Календарі не створено: ${r.error}` : r.invited ? ' Запрошення надіслано кандидату.' : '';
  }
  revalidatePath('/pipeline');
  revalidatePath('/calendar');
  revalidatePath('/vacancies', 'layout');
  revalidatePath('/candidates', 'layout');
  return { ok: `Етап змінено.${note}` };
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
