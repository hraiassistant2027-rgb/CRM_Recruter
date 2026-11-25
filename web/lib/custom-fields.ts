// Власні поля карток (етап 8): опис полів зберігається в таблиці fields, значення — у колонці custom картки.

export type FieldDef = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_required: boolean;
  options: string[];
  help_text: string | null;
  show_in_list: boolean;
  sort_order: number;
  archived_at: string | null;
};

export type CustomValue = string | number | boolean | string[] | null;
export type CustomValues = Record<string, CustomValue>;

export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Текст (один рядок)',
  long_text: 'Довгий текст',
  number: 'Число',
  money: 'Сума, грн',
  date: 'Дата',
  boolean: 'Так / ні',
  select: 'Список (один варіант)',
  multiselect: 'Список (кілька варіантів)',
  email: 'Email',
  phone: 'Телефон',
  url: 'Посилання',
};

export const ENTITY_LABELS: Record<string, string> = { candidates: 'Картка кандидата', vacancies: 'Картка вакансії' };

export const FIELD_COLUMNS = 'id, code, name, type, is_required, options, help_text, show_in_list, sort_order, archived_at';

// Позначка у формі: власні поля відмальовано (без неї форма не чіпає custom — напр. швидке додавання кандидата)
export const CUSTOM_MARKER = 'cf__present';
export const inputName = (code: string) => `cf_${code}`;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Читає значення власних полів з форми і перевіряє їх. Значення архівних полів і полів,
// яких немає у формі, зберігаються як були.
export function readCustomValues(
  formData: FormData,
  defs: FieldDef[],
  existing: CustomValues | null | undefined,
): { values: CustomValues; errors: Record<string, string> } | null {
  if (formData.get(CUSTOM_MARKER) !== '1') return null;
  const values: CustomValues = { ...(existing ?? {}) };
  const errors: Record<string, string> = {};
  for (const f of defs) {
    if (f.archived_at) continue;
    const key = inputName(f.code);
    const err = (m: string) => (errors[key] = m);
    if (f.type === 'boolean') {
      values[f.code] = formData.get(key) === 'on';
      continue;
    }
    if (f.type === 'multiselect') {
      const picked = formData.getAll(key).map(String).filter((v) => f.options.includes(v));
      if (f.is_required && picked.length === 0) err('Оберіть хоча б один варіант');
      values[f.code] = picked.length ? picked : null;
      continue;
    }
    const raw = String(formData.get(key) ?? '').trim();
    if (raw === '') {
      if (f.is_required) err("Обов'язкове поле");
      values[f.code] = null;
      continue;
    }
    switch (f.type) {
      case 'text':
        if (raw.length > 500) err('Не більше 500 символів');
        values[f.code] = raw;
        break;
      case 'long_text':
        if (raw.length > 5000) err('Не більше 5000 символів');
        values[f.code] = raw;
        break;
      case 'number':
      case 'money': {
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n) || Math.abs(n) >= 1e12) err('Вкажіть число');
        else if (f.type === 'money' && n < 0) err('Сума не може бути від’ємною');
        values[f.code] = Number.isFinite(n) ? n : null;
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) err('Невірна дата');
        values[f.code] = raw;
        break;
      case 'select':
        if (!f.options.includes(raw)) err('Оберіть варіант зі списку');
        values[f.code] = raw;
        break;
      case 'email':
        if (!EMAIL.test(raw) || raw.length > 200) err('Невірний email');
        values[f.code] = raw.toLowerCase();
        break;
      case 'phone':
        if (!/^[+\d\s()-]{5,32}$/.test(raw)) err('Невірний номер телефону');
        values[f.code] = raw;
        break;
      case 'url':
        if (!/^https?:\/\/\S+$/i.test(raw) || raw.length > 500) err('Посилання має починатися з http:// або https://');
        values[f.code] = raw;
        break;
      default:
        values[f.code] = raw.slice(0, 500);
    }
  }
  return { values, errors };
}

// Значення для показу в картці і списку
export function formatCustomValue(f: Pick<FieldDef, 'type'>, v: CustomValue | undefined): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '—';
  if (f.type === 'boolean') return v ? 'Так' : 'Ні';
  if (Array.isArray(v)) return v.join(', ');
  if (f.type === 'money' && typeof v === 'number') return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(v)} грн`;
  if (f.type === 'number' && typeof v === 'number') return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 4 }).format(v);
  if (f.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)}`;
  return String(v);
}

export function hasValue(v: CustomValue | undefined): boolean {
  return !(v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0));
}
