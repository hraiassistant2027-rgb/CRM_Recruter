import { describe, expect, it } from 'vitest';
import { buildReport, plural, reportSheetRows, shortName, summarize, type ReportVacancy } from './vacancy-report';

const base: ReportVacancy = {
  id: 'v1', title: 'Прораб', headcount: 1, status: 'open', opened_at: '2026-10-01', closed_at: null, recruiter_id: 'u1',
  legal_entity_id: 'e1', project_id: 'p1', work_place: 'site', request_type: 'replacement', difficulty_class: 'B',
  planned_close_days: null, request_adjusted_at: null, report_note: null,
};
const ctx = {
  legalEntities: new Map([['e1', { name: 'ТОВ КАН', color: '#93C5FD' }]]),
  projects: new Map([['p1', 'буд']]),
  users: new Map([['u1', 'Іваненко М.']]),
  managerStageOrder: 6,
  today: '2026-11-25',
};

describe('звіт по вакансіях', () => {
  it('рахує дні в роботі, план за класом і прострочення', () => {
    const [r] = buildReport({ ...ctx, vacancies: [base], applications: [], interviews: [] });
    expect(r.daysInWork).toBe(55);
    expect(r.plannedDays).toBe(45);
    expect(r.deadline).toBe('2026-11-15');
    expect(r.daysLeft).toBe(-10);
    expect(r.workPlace).toBe("Об'єкт");
    expect(r.requestType).toBe('Заміна');
    expect(r.legalEntity?.color).toBe('#93C5FD');
    expect(summarize([r]).overdue).toBe(1);
  });

  it('дата коригування заявки зсуває плановий строк', () => {
    const [r] = buildReport({ ...ctx, vacancies: [{ ...base, request_adjusted_at: '2026-11-01' }], applications: [], interviews: [] });
    expect(r.deadline).toBe('2026-12-16');
    expect(r.daysLeft).toBe(21);
  });

  it('працевлаштований кандидат закриває вакансію і дає дату оформлення', () => {
    const [r] = buildReport({
      ...ctx,
      vacancies: [base],
      applications: [{ id: 'a1', vacancy_id: 'v1', stage_kind: 'hired', stage_order: 11, hired_at: '2026-11-10T09:00:00Z', candidate_name: 'Петренко Олег' }],
      interviews: [{ application_id: 'a1', kind: 'start', starts_at: '2026-11-12T07:00:00Z' }],
    });
    expect(r.closed).toBe(true);
    expect(r.candidates).toBe('Петренко Олег');
    expect(r.startDate).toBe('2026-11-12');
    expect(r.closeDays).toBe(42);
    expect(r.daysLeft).toBeNull();
  });

  it('без працевлаштованих показує скільки кандидатів передано керівнику', () => {
    const apps = [
      { id: 'a1', vacancy_id: 'v1', stage_kind: 'open', stage_order: 6, hired_at: null, candidate_name: 'А' },
      { id: 'a2', vacancy_id: 'v1', stage_kind: 'rejected', stage_order: 12, hired_at: null, candidate_name: 'Б' },
      { id: 'a3', vacancy_id: 'v1', stage_kind: 'open', stage_order: 2, hired_at: null, candidate_name: 'В' },
    ];
    const [r] = buildReport({ ...ctx, vacancies: [base], applications: apps, interviews: [{ application_id: 'a2', kind: 'manager', starts_at: '2026-11-01T08:00:00Z' }] });
    expect(r.candidates).toBe('Передано 2 кандидати');
    const [n] = buildReport({ ...ctx, vacancies: [{ ...base, report_note: 'Чекаємо погодження' }], applications: apps, interviews: [] });
    expect(n.candidates).toBe('Чекаємо погодження');
  });

  it('допоміжні функції і рядки для Excel', () => {
    expect(shortName('Іваненко Марія Петрівна')).toBe('Іваненко М.');
    expect(plural(5, 'кандидат', 'кандидати', 'кандидатів')).toBe('кандидатів');
    expect(plural(22, 'день', 'дні', 'днів')).toBe('дні');
    const [r] = buildReport({ ...ctx, vacancies: [base], applications: [], interviews: [] });
    const [row] = reportSheetRows([r]);
    expect(row[0]).toEqual({ fill: '#93C5FD' });
    expect(row).not.toContain('ТОВ КАН');
    expect(row[8]).toBe('01.10.2026');
  });
});
