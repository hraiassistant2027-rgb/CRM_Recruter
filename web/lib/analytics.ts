// Аналітика рекрутингу (етап 7): фільтри і типи результату analytics_report()
import { addDays, kyivToday } from './vacancy-report';

export type AnalyticsFilters = { from: string; to: string; recruiter: string; entity: string; project: string; cls: string; preset: string };

export type Analytics = {
  bucket: 'week' | 'month';
  kpi: {
    new_candidates: number; applications: number; interviews: number; offers: number; hires: number;
    avg_days_to_hire: number | null; vacancies_opened: number; vacancies_closed: number; avg_close_days: number | null;
    open_now: number; overdue_now: number;
  };
  funnel: { name: string; color: string; kind: string; count: number }[];
  rejections: { name: string; side: 'company' | 'candidate'; count: number }[];
  sources: { name: string; color: string; candidates: number; applications: number; manager: number; offers: number; hires: number }[];
  recruiters: { id: string; name: string; open_now: number; overdue: number; closed: number; avg_close_days: number | null; candidates: number; interviews: number; hires: number }[];
  dynamics: { period: string; opened: number; closed: number; hires: number; candidates: number }[];
};

export const PRESETS: Record<string, { label: string; days: number }> = {
  '30': { label: '30 днів', days: 30 },
  '90': { label: 'Квартал', days: 90 },
  '365': { label: 'Рік', days: 365 },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readAnalyticsFilters(sp: Record<string, string | string[] | undefined>, today = kyivToday()): AnalyticsFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  let preset = one('preset');
  let from = DATE.test(one('from')) ? one('from') : '';
  let to = DATE.test(one('to')) ? one('to') : '';
  if (preset in PRESETS) {
    to = today;
    from = addDays(today, -(PRESETS[preset].days - 1));
  } else if (from && to && from <= to) {
    preset = 'custom';
  } else {
    preset = '90';
    to = today;
    from = addDays(today, -89);
  }
  return {
    from,
    to,
    preset,
    recruiter: UUID.test(one('recruiter')) ? one('recruiter') : '',
    entity: UUID.test(one('entity')) ? one('entity') : '',
    project: UUID.test(one('project')) ? one('project') : '',
    cls: ['A', 'B', 'C', 'D'].includes(one('cls')) ? one('cls') : '',
  };
}

export function rpcArgs(f: AnalyticsFilters) {
  return {
    p_from: f.from,
    p_to: f.to,
    p_recruiter: f.recruiter || null,
    p_entity: f.entity || null,
    p_project: f.project || null,
    p_class: f.cls || null,
  };
}

export function pct(part: number, whole: number): string {
  if (!whole) return '—';
  const v = (part / whole) * 100;
  return `${v < 10 && v > 0 ? v.toFixed(1) : Math.round(v)}%`;
}

const MONTHS = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];
export function periodLabel(date: string, bucket: 'week' | 'month'): string {
  const m = Number(date.slice(5, 7)) - 1;
  return bucket === 'month' ? `${MONTHS[m]} ${date.slice(2, 4)}` : `${Number(date.slice(8, 10))} ${MONTHS[m]}`;
}
