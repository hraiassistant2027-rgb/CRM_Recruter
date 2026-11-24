import { z } from 'zod';

const LETTER = /[A-Za-zА-Яа-яІіЇїЄєҐґ]/;
const DIGIT = /\d/;

export const passwordSchema = z
  .string()
  .min(12, 'Пароль має містити щонайменше 12 символів')
  .max(128, 'Пароль задовгий (максимум 128 символів)')
  .refine((v) => LETTER.test(v) && DIGIT.test(v), 'Пароль має містити і літери, і цифри');

export const emailSchema = z.string().trim().toLowerCase().email('Невірний формат email');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Введіть пароль'),
});

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'Паролі не збігаються', path: ['confirm'] });

export const inviteSchema = z.object({
  full_name: z.string().trim().min(2, "Вкажіть ім'я та прізвище").max(120, "Задовге ім'я"),
  email: emailSchema,
  role_code: z.string().trim().min(1, 'Оберіть роль'),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Вкажіть ім'я та прізвище").max(120, "Задовге ім'я"),
  phone: z
    .string()
    .trim()
    .max(32, 'Задовгий номер')
    .regex(/^[+\d\s()-]*$/, 'Телефон може містити лише цифри, пробіли, +, -, ( )')
    .transform((v) => (v === '' ? null : v)),
});

export const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Введіть 6 цифр із застосунку-автентифікатора'));

export const uuidSchema = z.string().uuid('Невірний ідентифікатор');

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Перевірте введені дані';
}

// Безпечне перенаправлення після входу: лише внутрішні шляхи
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

// ---------------------------------------------------------------------
// Кандидати (етап 3)
// ---------------------------------------------------------------------
const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === '' ? null : v));

export const LEGAL_BASES = ['consent', 'pre_contract', 'legitimate_interest'] as const;

export const candidateSchema = z.object({
  full_name: z.string().trim().min(2, "Вкажіть ПІБ кандидата").max(200, 'Задовге ПІБ'),
  phone: optionalText(32, 'Задовгий номер').refine((v) => v === null || /^[+\d\s()-]+$/.test(v), {
    message: 'Телефон може містити лише цифри, пробіли, +, -, ( )',
  }),
  email: optionalText(200, 'Задовгий email').refine((v) => v === null || z.string().email().safeParse(v).success, {
    message: 'Невірний формат email',
  }),
  city: optionalText(100, 'Задовга назва міста'),
  linkedin_url: optionalText(300, 'Задовге посилання').refine((v) => v === null || /linkedin\.com\//i.test(v), {
    message: 'Посилання має вести на linkedin.com',
  }),
  current_position: optionalText(200, 'Задовга назва посади'),
  source_id: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.string().uuid('Невірне джерело').nullable()),
  experience_years: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 70), { message: 'Досвід — число років від 0 до 70' }),
  desired_salary: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e9), { message: 'Зарплата — додатне число' }),
  salary_currency: z.enum(['UAH', 'USD', 'EUR'], { message: 'Оберіть валюту' }),
  available_from: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Невірна дата' }),
  skills: z
    .string()
    .max(2000, 'Забагато навичок')
    .transform((v) =>
      Array.from(new Set(v.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 60))).slice(0, 50),
    ),
  summary: optionalText(5000, 'Задовгий опис'),
});
export type CandidateInput = z.infer<typeof candidateSchema>;

export const consentSchema = z.object({
  legal_basis: z.enum(LEGAL_BASES, { message: 'Оберіть правову підставу' }),
  source: z.string().trim().min(2, 'Вкажіть, як отримано згоду або дані').max(300, 'Задовгий опис'),
  expires_at: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Невірна дата' }),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, 'Нотатка порожня').max(5000, 'Задовга нотатка'),
});

// Дозволені формати резюме (перевіряються і на сервері, і в сховищі)
export const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export const RESUME_MAX_BYTES = 20 * 1024 * 1024;

export function resumeFileIssue(name: string, size: number): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ext in RESUME_TYPES)) return 'Формат не підтримується. Дозволено: PDF, DOC, DOCX, RTF, TXT, JPG, PNG';
  if (size <= 0) return 'Файл порожній';
  if (size > RESUME_MAX_BYTES) return 'Файл більший за 20 МБ';
  return null;
}

// Безпечна назва файлу для шляху у сховищі (оригінальна назва зберігається окремо)
export function safeFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin';
  const base = name
    .slice(0, name.length - ext.length - 1)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'resume'}.${ext}`;
}

// ---------------------------------------------------------------------
// Вакансії (етап 4)
// ---------------------------------------------------------------------
const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().uuid('Невірне значення').nullable());

const optionalMoney = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.'))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 1e9), { message: 'Сума — додатне число' });

export const VACANCY_STATUSES = ['draft', 'open', 'on_hold', 'closed', 'cancelled'] as const;
export const VACANCY_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const vacancySchema = z
  .object({
    title: z.string().trim().min(2, 'Вкажіть назву вакансії').max(200, 'Задовга назва'),
    site_id: optionalUuid,
    department_id: optionalUuid,
    hiring_manager_name: optionalText(200, "Задовге ім'я"),
    hiring_manager_id: optionalUuid,
    recruiter_id: optionalUuid,
    headcount: z
      .string()
      .trim()
      .transform((v) => (v === '' ? 1 : Number(v)))
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 1000, { message: 'Кількість місць — ціле число від 1' }),
    salary_min: optionalMoney,
    salary_max: optionalMoney,
    salary_currency: z.enum(['UAH', 'USD', 'EUR'], { message: 'Оберіть валюту' }),
    priority: z.enum(VACANCY_PRIORITIES, { message: 'Оберіть пріоритет' }),
    status: z.enum(VACANCY_STATUSES, { message: 'Оберіть статус' }),
    opened_at: z
      .string()
      .trim()
      .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Вкажіть дату відкриття' }),
    requirements: optionalText(10000, 'Задовгий опис'),
  })
  .refine((v) => v.salary_min === null || v.salary_max === null || v.salary_max >= v.salary_min, {
    message: 'Максимальна зарплата не може бути меншою за мінімальну',
    path: ['salary_max'],
  });
export type VacancyInput = z.infer<typeof vacancySchema>;

export const dictionaryItemSchema = z.object({
  name: z.string().trim().min(2, 'Вкажіть назву').max(200, 'Задовга назва'),
  extra: optionalText(300, 'Задовгий текст'),
});
