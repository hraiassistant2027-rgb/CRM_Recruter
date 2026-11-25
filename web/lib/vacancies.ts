// Довідники і типи для вакансій та воронки

export const VACANCY_STATUS_LABELS: Record<string, string> = {
  draft: 'Чернетка',
  open: 'Відкрита',
  on_hold: 'На паузі',
  closed: 'Закрита',
  cancelled: 'Скасована',
};

export const VACANCY_STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  open: 'ok',
  on_hold: 'warn',
  closed: 'neutral',
  cancelled: 'danger',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низький',
  normal: 'Звичайний',
  high: 'Високий',
  urgent: 'Терміново',
};

// Поля звіту по вакансіях
export const WORK_PLACE_LABELS: Record<string, string> = { office: 'Офіс', site: "Об'єкт", remote: 'Віддалено' };
export const REQUEST_TYPE_LABELS: Record<string, string> = { new: 'Нова', replacement: 'Заміна', expansion: 'Розширення', maternity: 'Декрет' };
export const CLASS_INFO: Record<string, { label: string; days: number; traits: string; tactic: string }> = {
  A: { label: 'Легка', days: 30, traits: 'Масові позиції, великий ринок кандидатів', tactic: 'Job-сайти, швидкий відбір' },
  B: { label: 'Середня', days: 45, traits: 'Типові спеціалісти з досвідом', tactic: 'Job-сайти, база резюме, рекомендації' },
  C: { label: 'Складна', days: 90, traits: 'Вузькі спеціалісти, дефіцит на ринку', tactic: 'Активний пошук, LinkedIn, Telegram' },
  D: { label: 'Критична', days: 180, traits: 'Керівники, унікальна експертиза', tactic: 'Headhunting, прямий пошук' },
};

export type Stage = { id: string; code: string; name: string; color: string; sort_order: number; kind: string; sla_days: number | null; contact_kind: string | null };

export type VacancyRow = {
  id: string;
  title: string;
  site_id: string | null;
  department_id: string | null;
  hiring_manager_name: string | null;
  hiring_manager_id: string | null;
  recruiter_id: string | null;
  headcount: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  requirements: string | null;
  opened_at: string;
  closed_at: string | null;
  priority: string;
  status: string;
  pipeline_id: string;
  legal_entity_id: string | null;
  project_id: string | null;
  work_place: string | null;
  request_type: string | null;
  difficulty_class: string | null;
  planned_close_days: number | null;
  request_adjusted_at: string | null;
  report_note: string | null;
  created_at: string;
  updated_at: string;
};

export const VACANCY_COLUMNS =
  'id, title, site_id, department_id, hiring_manager_name, hiring_manager_id, recruiter_id, headcount, salary_min, salary_max, salary_currency, requirements, opened_at, closed_at, priority, status, pipeline_id, legal_entity_id, project_id, work_place, request_type, difficulty_class, planned_close_days, request_adjusted_at, report_note, created_at, updated_at';

export type BoardCard = {
  id: string;
  candidate_id: string;
  full_name: string;
  current_position: string | null;
  city: string | null;
  stage_id: string;
  stage_changed_at: string;
  rejection_reason: string | null;
};

export function salaryRange(min: number | null, max: number | null, currency: string): string {
  const f = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n);
  if (min == null && max == null) return '—';
  if (min != null && max != null) return min === max ? `${f(min)} ${currency}` : `${f(min)}–${f(max)} ${currency}`;
  return min != null ? `від ${f(min)} ${currency}` : `до ${f(max!)} ${currency}`;
}

// Скільки днів кандидат на поточному етапі (для підсвічування, якщо перевищено норму етапу)
export function daysOnStage(changedAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(changedAt).getTime()) / 86_400_000));
}
