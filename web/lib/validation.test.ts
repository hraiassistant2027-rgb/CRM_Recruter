import { describe, expect, it } from 'vitest';
import { inviteSchema, newPasswordSchema, profileSchema, safeNext, totpCodeSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';

describe('пароль', () => {
  it('приймає надійний пароль', () => {
    expect(newPasswordSchema.safeParse({ password: 'Будівництво2026!', confirm: 'Будівництво2026!' }).success).toBe(true);
  });
  it('відхиляє короткий, без цифр і розбіжний', () => {
    expect(newPasswordSchema.safeParse({ password: 'short1', confirm: 'short1' }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: 'onlylettersssss', confirm: 'onlylettersssss' }).success).toBe(false);
    const r = newPasswordSchema.safeParse({ password: 'GoodPassword123', confirm: 'GoodPassword124' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Паролі не збігаються');
  });
});

describe('запрошення', () => {
  it('нормалізує email', () => {
    const r = inviteSchema.parse({ full_name: ' Іван Петренко ', email: ' Ivan@Mail.COM ', role_code: 'recruiter' });
    expect(r.email).toBe('ivan@mail.com');
    expect(r.full_name).toBe('Іван Петренко');
  });
  it('без ролі не можна', () => {
    expect(inviteSchema.safeParse({ full_name: 'Іван', email: 'a@b.ua', role_code: '' }).success).toBe(false);
  });
});

describe('профіль і код MFA', () => {
  it('порожній телефон стає null', () => {
    expect(profileSchema.parse({ full_name: 'Олена', phone: '' }).phone).toBeNull();
  });
  it('код з пробілом приймається, з літерами — ні', () => {
    expect(totpCodeSchema.parse('123 456')).toBe('123456');
    expect(totpCodeSchema.safeParse('12a456').success).toBe(false);
  });
});

describe('safeNext', () => {
  it('пропускає лише внутрішні шляхи', () => {
    expect(safeNext('/candidates')).toBe('/candidates');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('translateError', () => {
  it('перекладає типові помилки', () => {
    expect(translateError({ message: 'Invalid login credentials' })).toBe('Невірний email або пароль');
    expect(translateError({ code: 'user_banned' })).toBe('Доступ заблоковано адміністратором');
    expect(translateError({ code: 'otp_expired', message: 'Email link is invalid or has expired' })).toContain('Посилання застаріло');
    expect(translateError({ code: '42501', message: 'permission denied for table roles' })).toBe('Недостатньо прав для цієї дії');
    expect(translateError({ message: 'something odd' })).toContain('Сталася помилка');
  });
});
