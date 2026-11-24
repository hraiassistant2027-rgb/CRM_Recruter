// Час співбесід завжди в київському часовому поясі (з урахуванням літнього/зимового часу)
export const TZ = 'Europe/Kyiv';

function offsetMinutes(utcMs: number, timeZone = TZ): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

// "2026-11-25" + "14:30" (київський час) -> Date (UTC)
export function kyivToDate(date: string, time: string): Date | null {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let utc = naive - offsetMinutes(naive) * 60000;
  utc = naive - offsetMinutes(utc) * 60000; // уточнення біля переходу на літній час
  return new Date(utc);
}

// Date -> { date: "2026-11-25", time: "14:30" } у київському часі (для форм)
export function dateToKyiv(value: string | Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(value));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function formatInterviewDate(value: string | Date): string {
  return new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

// Початок тижня (понеділок) у київському часі для дати "YYYY-MM-DD"
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + days));
  return day.toISOString().slice(0, 10);
}

export function todayKyiv(): string {
  return dateToKyiv(new Date()).date;
}
