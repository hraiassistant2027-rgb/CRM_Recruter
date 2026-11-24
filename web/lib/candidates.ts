// Довідники і форматування для розділу «База кандидатів»

export const LEGAL_BASIS_LABELS: Record<string, string> = {
  consent: 'Згода кандидата',
  pre_contract: 'Підготовка до укладення договору (кандидат сам надіслав резюме)',
  legitimate_interest: 'Законний інтерес компанії',
};

export const MATCH_LABELS: Record<string, string> = {
  phone: 'телефон',
  email: 'email',
  linkedin: 'LinkedIn',
  name: 'схоже ПІБ',
  profile: 'профіль',
  resume: 'текст резюме',
};

export const PARSE_STATUS_LABELS: Record<string, string> = {
  pending: 'очікує обробки',
  extracting: 'читається текст',
  parsing: 'розпізнається',
  parsed: 'дані розпізнано',
  indexed_only: 'текст доступний для пошуку',
  failed: 'текст не прочитано (скан?)',
  skipped_duplicate: 'дублікат',
};

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'Europe/Kyiv',
  }).format(d);
}

export function formatSalary(amount: number | null, currency: string): string {
  if (amount === null || amount === undefined) return '—';
  return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

export function formatExperience(months: number | null): string {
  if (months === null || months === undefined) return '—';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years ? `${years} р.` : '';
  const m = rest ? `${rest} міс.` : '';
  return [y, m].filter(Boolean).join(' ') || 'менше місяця';
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export type CandidateRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  linkedin_url: string | null;
  current_position: string | null;
  source_id: string | null;
  total_experience_months: number | null;
  desired_salary: number | null;
  salary_currency: string;
  available_from: string | null;
  skills: string[];
  summary: string | null;
  owner_id: string | null;
  review_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export const CANDIDATE_COLUMNS =
  'id, full_name, phone, email, city, linkedin_url, current_position, source_id, total_experience_months, desired_salary, salary_currency, available_from, skills, summary, owner_id, review_status, created_at, updated_at, deleted_at';

export type DuplicateRow = {
  candidate_id: string;
  match_type: 'exact' | 'probable';
  matched_on: string;
  score: number;
  accessible: boolean;
  full_name: string | null;
  city: string | null;
  owner_name: string | null;
};
