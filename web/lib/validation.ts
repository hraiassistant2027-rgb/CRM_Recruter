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
