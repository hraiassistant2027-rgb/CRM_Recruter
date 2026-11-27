import 'server-only';

// ---------------------------------------------------------------------
// Офіційне API для роботодавців robota.ua (employer-api.robota.ua).
// Вхід — логін і пароль кабінету роботодавця, далі токен (діє близько доби).
// ---------------------------------------------------------------------
const AUTH_URL = 'https://auth-api.robota.ua';
const API_URL = 'https://employer-api.robota.ua';
const TIMEOUT = 15000;
export const PAGE_SIZE = 20;

export class RobotaError extends Error {
  constructor(message: string, readonly authFailed = false) {
    super(message);
  }
}

export type RobotaVacancy = { id: number; name: string; state: string | null; city: string | null };

export type RobotaApply = {
  id: number;
  resumeId?: number | null;
  name?: string | null;
  eMail?: string | null;
  email?: string | null;
  phone?: string | null;
  phones?: { value?: string | null }[] | null;
  speciality?: string | null;
  cityName?: string | null;
  salary?: number | null;
  skillsSummary?: string | null;
  experiences?: { position?: string | null; company?: string | null; description?: string | null; dateFrom?: string | null; dateTo?: string | null }[] | null;
  fileName?: string | null;
};

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
  } catch {
    throw new RobotaError('robota.ua не відповідає — спробуємо пізніше');
  }
  if (res.status === 401 || res.status === 403) throw new RobotaError('robota.ua не прийняв вхід — перевірте логін і пароль кабінету', true);
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new RobotaError(`robota.ua відповів помилкою (HTTP ${res.status})`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function findToken(data: unknown, depth = 0): string | null {
  if (typeof data === 'string') {
    const t = data.trim().replace(/^"|"$/g, '');
    return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t) || (t.length >= 20 && !/\s/.test(t) && !t.startsWith('<')) ? t : null;
  }
  if (!data || typeof data !== 'object' || depth > 2) return null;
  const o = data as Record<string, unknown>;
  for (const k of ['token', 'access_token', 'accessToken', 'jwt', 'Token']) {
    if (typeof o[k] === 'string') return findToken(o[k], depth + 1);
  }
  for (const k of ['data', 'result']) {
    const t = findToken(o[k], depth + 1);
    if (t) return t;
  }
  return null;
}

export async function robotaLogin(login: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
      body: JSON.stringify({ username: login, password, remember: true }),
      signal: AbortSignal.timeout(TIMEOUT),
      cache: 'no-store',
    });
  } catch {
    throw new RobotaError('robota.ua не відповідає — спробуйте за хвилину');
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* відповідь не JSON */
  }
  const token = res.ok ? findToken(data) : null;
  if (token) return token;

  // Діагностика в журнал сервера (без пароля і без токена)
  const shape = data && typeof data === 'object' ? `keys: ${Object.keys(data as object).join(',')}` : `text: ${text.slice(0, 120)}`;
  console.error('robota.ua login failed', res.status, shape);
  const serverMsg =
    data && typeof data === 'object'
      ? String((data as Record<string, unknown>).message ?? (data as Record<string, unknown>).error ?? (data as Record<string, unknown>).title ?? '').slice(0, 150)
      : '';
  if (res.status === 400 || res.status === 401)
    throw new RobotaError(`robota.ua не прийняв логін або пароль (код ${res.status}${serverMsg ? `: ${serverMsg}` : ''})`, true);
  if (res.status === 403 || res.status === 429)
    throw new RobotaError(`robota.ua заблокував запит із сервера CRM (код ${res.status}) — потрібен доступ до API від robota.ua`);
  if (!res.ok) throw new RobotaError(`robota.ua відповів помилкою (код ${res.status}${serverMsg ? `: ${serverMsg}` : ''})`);
  throw new RobotaError(`robota.ua відповів, але без ключа доступу (${shape.slice(0, 120)}). Надішліть цей текст розробнику`, true);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

function pickList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    const v = (data as Record<string, unknown> | null)?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export async function robotaVacancies(token: string, maxPages = 15): Promise<RobotaVacancy[]> {
  const all: RobotaVacancy[] = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await call<unknown>(`${API_URL}/vacancy/list`, { method: 'POST', headers: auth(token), body: JSON.stringify({ page }) });
    const list = pickList(data, ['vacancies', 'items', 'data']) as Record<string, unknown>[];
    for (const v of list) {
      const id = Number(v.id ?? v.vacancyId);
      if (!Number.isFinite(id) || id <= 0) continue;
      all.push({
        id,
        name: String(v.name ?? v.title ?? v.vacancyName ?? '').trim(),
        state: (v.state ?? v.status ?? null) as string | null,
        city: (v.cityName ?? v.city ?? null) as string | null,
      });
    }
    if (list.length < PAGE_SIZE) break;
  }
  return all;
}

export async function robotaApplies(token: string, vacancyId: number, page: number): Promise<RobotaApply[]> {
  const data = await call<unknown>(`${API_URL}/apply/list`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      vacancyId,
      folderId: 0,
      page,
      filter: '',
      candidateTypes: ['Application', 'ApplicationWithResume', 'ApplicationWithFile', 'VacancyInteraction'],
    }),
  });
  return (pickList(data, ['applies', 'items', 'data']) as RobotaApply[]).filter((a) => Number.isFinite(Number(a?.id)));
}

// Стан вакансії, за якою вже не варто перевіряти відгуки
export function inactiveState(state: string | null): boolean {
  return !!state && /closed|deleted|archiv/i.test(state);
}

const validDate = (v: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m && m[1] !== '0001' ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const plain = (html: string | null | undefined) =>
  (html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

export function resumeUrl(a: RobotaApply): string | null {
  return a.resumeId ? `https://robota.ua/candidates/${a.resumeId}` : null;
}

// Дані відгуку → поля картки кандидата (рядки — як з форми)
export function applyToCandidate(a: RobotaApply) {
  const phone = (a.phones?.find((p) => p?.value)?.value ?? a.phone ?? '').replace(/[^+\d\s()-]/g, '').trim();
  const email = (a.eMail ?? a.email ?? '').trim();
  const experience = (a.experiences ?? [])
    .map((e) => ({
      position: (e.position ?? '').trim().slice(0, 200) || null,
      company: (e.company ?? '').trim().slice(0, 200) || null,
      start: validDate(e.dateFrom),
      end: validDate(e.dateTo),
      description: plain(e.description).slice(0, 4000) || null,
    }))
    .filter((e) => e.position || e.company);
  const months = experience.reduce((sum, e) => {
    if (!e.start) return sum;
    const from = new Date(e.start).getTime();
    const to = e.end ? new Date(e.end).getTime() : Date.now();
    return to > from ? sum + Math.round((to - from) / (30.44 * 864e5)) : sum;
  }, 0);
  const link = resumeUrl(a);
  const summary = [plain(a.skillsSummary), link ? `Резюме на robota.ua: ${link}` : null, a.fileName ? `Кандидат прикріпив файл резюме «${a.fileName}» — він доступний у кабінеті robota.ua` : null]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 5000);
  return {
    raw: {
      full_name: (a.name ?? '').trim().slice(0, 200) || 'Без імені (robota.ua)',
      phone: phone.slice(0, 32),
      email: email.slice(0, 200),
      city: (a.cityName ?? '').trim().slice(0, 100),
      linkedin_url: '',
      current_position: (a.speciality ?? '').trim().slice(0, 200),
      experience_years: '',
      desired_salary: a.salary && a.salary > 0 ? String(a.salary) : '',
      salary_currency: 'UAH',
      available_from: '',
      skills: '',
      summary,
    } as Record<string, string>,
    experience,
    months: months > 0 ? months : null,
  };
}
