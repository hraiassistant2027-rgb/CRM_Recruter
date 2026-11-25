import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { BoardCard, Stage } from '@/lib/vacancies';

type Supa = Awaited<ReturnType<typeof createClient>>;

// Дані для канбан-дошки однієї вакансії
export async function loadBoard(supabase: Supa, vacancyId: string, pipelineId: string) {
  const [{ data: stages }, { data: apps }, { data: reasons }, { data: sites }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id, code, name, color, sort_order, kind, sla_days, contact_kind')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('applications')
      .select('id, candidate_id, stage_id, stage_changed_at, rejection_reason_id, candidates(full_name, current_position, city)')
      .eq('vacancy_id', vacancyId)
      .order('stage_changed_at', { ascending: false }),
    supabase.from('rejection_reasons').select('id, name, side').eq('is_active', true).order('sort_order'),
    supabase.from('sites').select('id, name, address').eq('is_active', true).order('name'),
  ]);
  const reasonName = new Map(((reasons ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));

  type AppRow = {
    id: string;
    candidate_id: string;
    stage_id: string;
    stage_changed_at: string;
    rejection_reason_id: string | null;
    candidates: { full_name: string; current_position: string | null; city: string | null } | { full_name: string; current_position: string | null; city: string | null }[] | null;
  };
  const cards: BoardCard[] = ((apps ?? []) as AppRow[]).map((a) => {
    const c = Array.isArray(a.candidates) ? a.candidates[0] : a.candidates;
    return {
      id: a.id,
      candidate_id: a.candidate_id,
      full_name: c?.full_name ?? 'Кандидат (немає доступу)',
      current_position: c?.current_position ?? null,
      city: c?.city ?? null,
      stage_id: a.stage_id,
      stage_changed_at: a.stage_changed_at,
      rejection_reason: a.rejection_reason_id ? reasonName.get(a.rejection_reason_id) ?? null : null,
    };
  });
  return {
    stages: (stages ?? []) as Stage[],
    cards,
    reasons: (reasons ?? []) as { id: string; name: string; side: 'company' | 'candidate' }[],
    sites: (sites ?? []) as { id: string; name: string; address: string | null }[],
  };
}

export async function loadOptions(supabase: Supa) {
  const [{ data: sites }, { data: departments }, { data: users }, { data: entities }, { data: projects }] = await Promise.all([
    supabase.from('sites').select('id, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('legal_entities').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('projects').select('id, name').eq('is_active', true).order('sort_order').order('name'),
  ]);
  return {
    sites: (sites ?? []) as { id: string; name: string }[],
    departments: (departments ?? []) as { id: string; name: string }[],
    legalEntities: (entities ?? []) as { id: string; name: string }[],
    projects: (projects ?? []) as { id: string; name: string }[],
    users: ((users ?? []) as { id: string; full_name: string }[]).map((u) => ({ id: u.id, name: u.full_name })),
  };
}
