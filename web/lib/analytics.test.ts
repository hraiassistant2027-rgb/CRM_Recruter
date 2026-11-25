import { describe, expect, it } from 'vitest';
import { pct, periodLabel, readAnalyticsFilters, rpcArgs } from './analytics';

describe('аналітика: фільтри', () => {
  it('за замовчуванням — останні 90 днів', () => {
    const f = readAnalyticsFilters({}, '2026-11-25');
    expect(f.preset).toBe('90');
    expect(f.from).toBe('2026-08-28');
    expect(f.to).toBe('2026-11-25');
  });
  it('швидкий вибір періоду і свій період', () => {
    expect(readAnalyticsFilters({ preset: '30' }, '2026-11-25').from).toBe('2026-10-27');
    const c = readAnalyticsFilters({ from: '2026-01-01', to: '2026-03-31' }, '2026-11-25');
    expect(c.preset).toBe('custom');
    expect(c.from).toBe('2026-01-01');
  });
  it('відкидає невірні значення фільтрів', () => {
    const f = readAnalyticsFilters({ recruiter: "1' or 1=1", cls: 'Z', from: '2026-05-01', to: '2026-01-01' }, '2026-11-25');
    expect(f.recruiter).toBe('');
    expect(f.cls).toBe('');
    expect(f.preset).toBe('90');
    expect(rpcArgs(f).p_recruiter).toBe(null);
  });
  it('відсотки і підписи періодів', () => {
    expect(pct(1, 4)).toBe('25%');
    expect(pct(1, 30)).toBe('3.3%');
    expect(pct(1, 0)).toBe('—');
    expect(periodLabel('2026-11-23', 'week')).toBe('23 лист');
    expect(periodLabel('2026-11-01', 'month')).toBe('лист 26');
  });
});
