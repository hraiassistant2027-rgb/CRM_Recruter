import { describe, expect, it } from 'vitest';
import { candidateSchema, consentSchema, resumeFileIssue, safeFileName } from './validation';
import { formatExperience } from './candidates';

const base = {
  full_name: 'Іваненко Петро',
  phone: '',
  email: '',
  city: '',
  linkedin_url: '',
  current_position: '',
  source_id: '',
  experience_years: '',
  desired_salary: '',
  salary_currency: 'UAH',
  available_from: '',
  skills: '',
  summary: '',
};

describe('картка кандидата', () => {
  it('порожні необов’язкові поля стають null', () => {
    const r = candidateSchema.parse(base);
    expect(r.phone).toBeNull();
    expect(r.source_id).toBeNull();
    expect(r.experience_years).toBeNull();
    expect(r.skills).toEqual([]);
  });
  it('ПІБ обов’язкове', () => {
    expect(candidateSchema.safeParse({ ...base, full_name: ' ' }).success).toBe(false);
  });
  it('навички розбиваються за комами без повторів', () => {
    expect(candidateSchema.parse({ ...base, skills: 'AutoCAD, кошторис,AutoCAD;  Revit ' }).skills).toEqual(['AutoCAD', 'кошторис', 'Revit']);
  });
  it('досвід і зарплата приймають кому та пробіли', () => {
    const r = candidateSchema.parse({ ...base, experience_years: '2,5', desired_salary: '45 000' });
    expect(r.experience_years).toBe(2.5);
    expect(r.desired_salary).toBe(45000);
  });
  it('невірні email, телефон, LinkedIn відхиляються', () => {
    expect(candidateSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...base, phone: '067-abc' }).success).toBe(false);
    expect(candidateSchema.safeParse({ ...base, linkedin_url: 'https://example.com/x' }).success).toBe(false);
  });
  it('підстава обробки даних — лише з переліку', () => {
    expect(consentSchema.safeParse({ legal_basis: 'consent', source: 'Письмова згода', expires_at: '' }).success).toBe(true);
    expect(consentSchema.safeParse({ legal_basis: 'whatever', source: 'x x', expires_at: '' }).success).toBe(false);
  });
});

describe('файли резюме', () => {
  it('дозволені формати і розмір', () => {
    expect(resumeFileIssue('cv.PDF', 1000)).toBeNull();
    expect(resumeFileIssue('cv.exe', 1000)).not.toBeNull();
    expect(resumeFileIssue('cv.pdf', 0)).not.toBeNull();
    expect(resumeFileIssue('cv.pdf', 25 * 1024 * 1024)).not.toBeNull();
  });
  it('безпечна назва файлу для сховища', () => {
    expect(safeFileName('Резюме Іваненко.docx')).toBe('resume.docx');
    expect(safeFileName('Резюме Іваненко (2024).docx')).toBe('2024.docx');
    expect(safeFileName('../../etc/passwd.pdf')).toBe('etc-passwd.pdf');
    expect(safeFileName('John Smith CV.pdf')).toBe('John-Smith-CV.pdf');
  });
  it('досвід у зрозумілому вигляді', () => {
    expect(formatExperience(30)).toBe('2 р. 6 міс.');
    expect(formatExperience(null)).toBe('—');
  });
});
