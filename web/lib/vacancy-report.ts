// Звіт по вакансіях: розрахунок рядків з даних вакансій, воронки і подій календаря.
// Чиста логіка без звернень до бази — щоб її можна було перевірити тестами.
import { CLASS_INFO, REQUEST_TYPE_LABELS, WORK_PLACE_LABELS } from './vacancies';

export type ReportVacancy = {
  id: string;
  title: string;
  headcount: number;
  status: string;
  opened_at: string; // YYYY-MM-DD
  closed_at: string | null;
  recruiter_id: string | null;
  legal_entity_id: string | null;
  project_id: string | null;
  work_place: string | null;
  request_type: string | null;
  difficulty_class: string | null;
  planned_close_days: number | null;
  request_adjusted_at: string | null;
  report_note: string | null;
};

export type ReportApplication = {
  id: string;
  vacancy_id: string;
  stage_kind: string; // open | offer | hired | rejected | withdrawn
  stage_order: number;
  hired_at: string | null;
  candidate_name: string | null;
};

export type ReportInterview = { application_id: string; kind: string; starts_at: string };

export type ReportRow = {
  id: string;
  title: string;
  headcount: number;
  status: string;
  closed: boolean;
  legalEntity: { name: string; color: string } | null;
  project: string | null;
  workPlace: string | null;
  requestType: string | null;
  difficultyClass: string | null;
  openedAt: string;
  adjustedAt: string | null;
  plannedDays: number | null;
  daysInWork: number;
  daysLeft: number | null; // лише для відкритих з планом; від'ємне — прострочено
  deadline: string | null; // плановий строк закриття (дата)
  closeDays: number | null; // за скільки днів фактично закрито
  candidates: string; // ПІБ працевлаштованих / коментар / «Передано N кандидатів»
  hiredCount: number;
  passedCount: number;
  startDate: string | null; // дата оформлення
  recruiter: string | null;
};

const DAY = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY);
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10);
}

export function kyivToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// «Іваненко Марія Петрівна» -> «Іваненко М.»
export function shortName(full: string | null | undefined): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? null;
  return `${parts[0]} ${parts[1][0]}.`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function buildReport(input: {
  vacancies: ReportVacancy[];
  applications: ReportApplication[];
  interviews: ReportInterview[];
  legalEntities: Map<string, { name: string; color: string }>;
  projects: Map<string, string>;
  users: Map<string, string>;
  managerStageOrder: number | null; // з якого етапу кандидат вважається «переданим керівнику»
  today: string;
}): ReportRow[] {
  const appsByVacancy = new Map<string, ReportApplication[]>();
  for (const a of input.applications) {
    const list = appsByVacancy.get(a.vacancy_id) ?? [];
    list.push(a);
    appsByVacancy.set(a.vacancy_id, list);
  }
  const interviewsByApp = new Map<string, ReportInterview[]>();
  for (const i of input.interviews) {
    const list = interviewsByApp.get(i.application_id) ?? [];
    list.push(i);
    interviewsByApp.set(i.application_id, list);
  }

  return input.vacancies.map((v) => {
    const apps = appsByVacancy.get(v.id) ?? [];
    const hired = apps.filter((a) => a.stage_kind === 'hired');
    const passed = apps.filter((a) => {
      const hadManager = (interviewsByApp.get(a.id) ?? []).some((i) => i.kind === 'manager');
      const reached = input.managerStageOrder != null && ['open', 'offer', 'hired'].includes(a.stage_kind) && a.stage_order >= input.managerStageOrder;
      return hadManager || reached;
    });

    // Дата оформлення: подія «вихід на роботу», інакше дата працевлаштування, інакше дата оферу
    let startDate: string | null = null;
    const candidatesForStart = hired.length ? hired : apps.filter((a) => a.stage_kind === 'offer');
    for (const a of candidatesForStart) {
      const evs = interviewsByApp.get(a.id) ?? [];
      const ev = evs.find((i) => i.kind === 'start') ?? evs.find((i) => i.kind === 'offer');
      const d = ev ? kyivToday(new Date(ev.starts_at)) : a.hired_at ? kyivToday(new Date(a.hired_at)) : null;
      if (d && (!startDate || d > startDate)) startDate = d;
    }

    const closed = v.status === 'closed' || hired.length >= v.headcount;
    const endDate = v.closed_at ?? (closed && startDate ? startDate : null);
    const daysInWork = Math.max(0, dayNumber(endDate ?? input.today) - dayNumber(v.opened_at));
    const plannedDays = v.planned_close_days ?? (v.difficulty_class ? CLASS_INFO[v.difficulty_class]?.days ?? null : null);
    const planStart = v.request_adjusted_at && v.request_adjusted_at > v.opened_at ? v.request_adjusted_at : v.opened_at;
    const deadline = plannedDays != null ? addDays(planStart, plannedDays) : null;
    const active = !closed && v.status !== 'cancelled';
    const daysLeft = active && deadline ? dayNumber(deadline) - dayNumber(input.today) : null;

    let candidates: string;
    if (hired.length) candidates = hired.map((a) => a.candidate_name ?? 'Кандидат').join(', ');
    else if (v.report_note) candidates = v.report_note;
    else if (passed.length) candidates = `Передано ${passed.length} ${plural(passed.length, 'кандидата', 'кандидати', 'кандидатів')}`;
    else candidates = apps.length ? `У відборі: ${apps.filter((a) => a.stage_kind === 'open' || a.stage_kind === 'offer').length}` : '—';

    return {
      id: v.id,
      title: v.title,
      headcount: v.headcount,
      status: v.status,
      closed,
      legalEntity: v.legal_entity_id ? input.legalEntities.get(v.legal_entity_id) ?? null : null,
      project: v.project_id ? input.projects.get(v.project_id) ?? null : null,
      workPlace: v.work_place ? WORK_PLACE_LABELS[v.work_place] ?? null : null,
      requestType: v.request_type ? REQUEST_TYPE_LABELS[v.request_type] ?? null : null,
      difficultyClass: v.difficulty_class,
      openedAt: v.opened_at,
      adjustedAt: v.request_adjusted_at,
      plannedDays,
      daysInWork,
      daysLeft,
      deadline,
      closeDays: closed ? daysInWork : null,
      candidates,
      hiredCount: hired.length,
      passedCount: passed.length,
      startDate,
      recruiter: v.recruiter_id ? input.users.get(v.recruiter_id) ?? null : null,
    };
  });
}

export type ReportSummary = { positions: number; open: number; closed: number; overdue: number; avgCloseDays: number | null };

export function summarize(rows: ReportRow[]): ReportSummary {
  const closedRows = rows.filter((r) => r.closed);
  const avg = closedRows.length ? Math.round(closedRows.reduce((s, r) => s + (r.closeDays ?? 0), 0) / closedRows.length) : null;
  return {
    positions: rows.reduce((s, r) => s + r.headcount, 0),
    open: rows.filter((r) => !r.closed && r.status !== 'cancelled').length,
    closed: closedRows.length,
    overdue: rows.filter((r) => r.daysLeft != null && r.daysLeft < 0).length,
    avgCloseDays: avg,
  };
}

// CSV для Excel (крапка з комою — роздільник, який Excel в українській локалі відкриває одразу)
export function reportCsv(rows: ReportRow[]): string {
  const head = [
    'Юр. особа', 'Закрита', 'Вакансія', 'К-ть', 'Місце роботи', 'Нова/заміна', 'Проект', 'Клас', 'Дата відкриття',
    'Дата коригування', 'Планова тривалість, дн', 'Днів в роботі', 'Залишилось днів', 'Кандидат / коментар',
    'Дата оформлення', 'Строк закриття, дн', 'Рекрутер',
  ];
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.legalEntity?.name, r.closed ? 'так' : '', r.title, r.headcount, r.workPlace, r.requestType, r.project, r.difficultyClass,
      r.openedAt, r.adjustedAt, r.plannedDays, r.daysInWork, r.daysLeft, r.candidates, r.startDate, r.closeDays, r.recruiter,
    ]
      .map(esc)
      .join(';'),
  );
  return '﻿' + [head.join(';'), ...lines].join('\r\n');
}
