import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { buildReport, kyivToday, shortName, type ReportApplication, type ReportInterview, type ReportVacancy } from './vacancy-report';

type Supa = Awaited<ReturnType<typeof createClient>>;

export type ReportFilters = {
  status: 'active' | 'closed' | 'all';
  entity: string;
  project: string;
  recruiter: string;
  cls: string;
  from: string;
  to: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readFilters(sp: Record<string, string | string[] | undefined>): ReportFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const status = one('status');
  return {
    status: status === 'closed' || status === 'all' ? status : status === 'active' ? 'active' : 'all',
    entity: UUID.test(one('entity')) ? one('entity') : '',
    project: UUID.test(one('project')) ? one('project') : '',
    recruiter: UUID.test(one('recruiter')) ? one('recruiter') : '',
    cls: ['A', 'B', 'C', 'D'].includes(one('cls')) ? one('cls') : '',
    from: DATE.test(one('from')) ? one('from') : '',
    to: DATE.test(one('to')) ? one('to') : '',
  };
}

const VAC_COLS =
  'id, title, headcount, status, opened_at, closed_at, recruiter_id, legal_entity_id, project_id, work_place, request_type, difficulty_class, planned_close_days, request_adjusted_at, report_note';

export async function loadVacancyReport(supabase: Supa, f: ReportFilters) {
  let q = supabase.from('vacancies').select(VAC_COLS).neq('status', 'draft').order('opened_at', { ascending: false }).limit(1000);
  if (f.entity) q = q.eq('legal_entity_id', f.entity);
  if (f.project) q = q.eq('project_id', f.project);
  if (f.recruiter) q = q.eq('recruiter_id', f.recruiter);
  if (f.cls) q = q.eq('difficulty_class', f.cls);
  if (f.from) q = q.gte('opened_at', f.from);
  if (f.to) q = q.lte('opened_at', f.to);

  const [{ data: vacData }, { data: stages }, { data: entities }, { data: projects }, { data: users }] = await Promise.all([
    q,
    supabase.from('pipeline_stages').select('id, code, kind, sort_order'),
    supabase.from('legal_entities').select('id, name, color, is_active').order('sort_order').order('name'),
    supabase.from('projects').select('id, name, is_active').order('sort_order').order('name'),
    supabase.from('profiles').select('id, full_name, is_active').order('full_name'),
  ]);
  const vacancies = (vacData ?? []) as ReportVacancy[];
  const ids = vacancies.map((v) => v.id);

  const applications: ReportApplication[] = [];
  const interviews: ReportInterview[] = [];
  const stageList = (stages ?? []) as { id: string; code: string; kind: string; sort_order: number }[];
  const stageById = new Map(stageList.map((s) => [s.id, s]));
  // Запити частинами, щоб не перевищити довжину URL
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data: apps } = await supabase
      .from('applications')
      .select('id, vacancy_id, stage_id, hired_at, candidates(full_name)')
      .in('vacancy_id', chunk)
      .is('deleted_at', null);
    type A = { id: string; vacancy_id: string; stage_id: string; hired_at: string | null; candidates: { full_name: string } | { full_name: string }[] | null };
    const appRows = (apps ?? []) as A[];
    for (const a of appRows) {
      const c = Array.isArray(a.candidates) ? a.candidates[0] : a.candidates;
      const st = stageById.get(a.stage_id);
      applications.push({
        id: a.id,
        vacancy_id: a.vacancy_id,
        stage_kind: st?.kind ?? 'open',
        stage_order: st?.sort_order ?? 0,
        hired_at: a.hired_at,
        candidate_name: c?.full_name ?? null,
      });
    }
    const appIds = appRows.map((a) => a.id);
    for (let j = 0; j < appIds.length; j += 150) {
      const { data: ivs } = await supabase
        .from('interviews')
        .select('application_id, kind, starts_at')
        .in('application_id', appIds.slice(j, j + 150))
        .in('kind', ['manager', 'offer', 'start'])
        .not('status', 'in', '(cancelled)');
      interviews.push(...((ivs ?? []) as ReportInterview[]));
    }
  }

  // Найменший порядок етапу «Співбесіда з керівником» (якщо в різних воронках різний — беремо найменший)
  const managerOrders = stageList.filter((s) => s.code === 'manager_interview').map((s) => s.sort_order);
  const entityList = (entities ?? []) as { id: string; name: string; color: string; is_active: boolean }[];
  const projectList = (projects ?? []) as { id: string; name: string; is_active: boolean }[];
  const userList = (users ?? []) as { id: string; full_name: string; is_active: boolean }[];

  let rows = buildReport({
    vacancies,
    applications,
    interviews,
    legalEntities: new Map(entityList.map((e) => [e.id, { name: e.name, color: e.color }])),
    projects: new Map(projectList.map((p) => [p.id, p.name])),
    users: new Map(userList.map((u) => [u.id, shortName(u.full_name) ?? u.full_name])),
    managerStageOrder: managerOrders.length ? Math.min(...managerOrders) : null,
    today: kyivToday(),
  });
  if (f.status === 'active') rows = rows.filter((r) => !r.closed && r.status !== 'cancelled');
  if (f.status === 'closed') rows = rows.filter((r) => r.closed);

  return {
    rows,
    entities: entityList,
    projects: projectList,
    users: userList.map((u) => ({ id: u.id, name: u.full_name })),
  };
}
