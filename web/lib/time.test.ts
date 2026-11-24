import { describe, expect, it } from 'vitest';
import { addDays, dateToKyiv, kyivToDate, weekStart } from './time';

describe('київський час співбесід', () => {
  it('зимовий час: UTC+2', () => {
    expect(kyivToDate('2026-11-25', '14:30')?.toISOString()).toBe('2026-11-25T12:30:00.000Z');
  });
  it('літній час: UTC+3', () => {
    expect(kyivToDate('2026-07-10', '09:00')?.toISOString()).toBe('2026-07-10T06:00:00.000Z');
  });
  it('зворотне перетворення для форми', () => {
    expect(dateToKyiv('2026-11-25T12:30:00.000Z')).toEqual({ date: '2026-11-25', time: '14:30' });
  });
  it('невірні значення', () => {
    expect(kyivToDate('25.11.2026', '14:30')).toBeNull();
  });
  it('тиждень з понеділка', () => {
    expect(weekStart('2026-11-26')).toBe('2026-11-23');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-23');
    expect(addDays('2026-11-30', 7)).toBe('2026-12-07');
  });
});
