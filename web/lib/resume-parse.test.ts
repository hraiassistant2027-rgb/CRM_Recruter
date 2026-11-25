import { describe, expect, it } from 'vitest';
import { findCity, findName, findPhone, nameFromFileName, parseResumeText, resumeDisplayName } from './resume-parse';

describe('розпізнавання резюме', () => {
  it('українське резюме з підписаними полями', () => {
    const r = parseResumeText(`Резюме
ІВАНЕНКО ПЕТРО МИКОЛАЙОВИЧ
Інженер-конструктор, 35 000 грн
Місто: Дніпро
Телефон: +38 (067) 123-45-67
E-mail: Petro.Ivanenko@gmail.com
linkedin.com/in/petro-ivanenko`);
    expect(r).toMatchObject({
      full_name: 'Іваненко Петро Миколайович',
      phone: '+38 067 123 45 67',
      email: 'petro.ivanenko@gmail.com',
      city: 'Дніпро',
      desired_salary: '35000',
      salary_currency: 'UAH',
      linkedin_url: 'https://linkedin.com/in/petro-ivanenko',
    });
  });
  it('англійське резюме', () => {
    const r = parseResumeText(`Olena Shevchenko
Project Manager
Kyiv, Ukraine | 093 555 44 33 | olena@ukr.net
Salary expectations: $2500`);
    expect(r).toMatchObject({ full_name: 'Shevchenko Olena', city: 'Київ', phone: '+38 093 555 44 33', desired_salary: '2500', salary_currency: 'USD' });
  });
  it('посада, місце проживання, зарплата «від»', () => {
    const r = parseResumeText(`Петренко Андрій
Бажана посада: Прораб
Місце проживання: м. Біла Церква
Зарплатні очікування: від 40 000 грн
тел. 0501234567`);
    expect(r).toMatchObject({ full_name: 'Петренко Андрій', current_position: 'Прораб', city: 'Біла Церква', desired_salary: '40000', phone: '+38 050 123 45 67' });
  });
  it('міста з кирилицею і невідомі міста з «м.»', () => {
    expect(findCity('Проживаю: Суми')).toBe('Суми');
    expect(findCity('Петро\nм. Ромни')).toBe('Ромни');
    expect(findCity('Сумська область')).toBeUndefined();
  });
  it('не плутає номери телефонів з іншими числами', () => {
    expect(findPhone('ІПН 1234567890, рік 2015-2020')).toBeUndefined();
  });
  it('порожній або короткий текст', () => {
    expect(parseResumeText('')).toEqual({});
  });
});

describe('порядок ПІБ: Прізвище Ім\'я По батькові', () => {
  it('переставляє «Ім\'я По-батькові Прізвище» та «Ім\'я Прізвище»', () => {
    expect(findName('Петро Миколайович Іваненко\nтел.')).toBe('Іваненко Петро Миколайович');
    expect(findName('Андрій Петренко\nПрораб')).toBe('Петренко Андрій');
    expect(findName('Петренко Андрій\nПрораб')).toBe('Петренко Андрій');
    expect(findName('ШЕВЧЕНКО ОЛЕНА ІГОРІВНА')).toBe('Шевченко Олена Ігорівна');
  });
  it('знаходить ПІБ у тексті без розривів рядків', () => {
    expect(findName('Резюме Іваненко Петро Миколайович Бажана посада Прораб Київ 0671234567')).toBe('Іваненко Петро Миколайович');
  });
});

describe('пошук ПІБ у складних випадках', () => {
  it('ПІБ після шапки сайту і з латинськими «i» всередині', () => {
    expect(findName('Work.ua\nРезюме від 24.11.2026\nЗагальна інформація\nКонтакти\nЛокація\nБажана посада\nКовальчук Вiталiй\nПрораб')).toBe(
      'Ковальчук Віталій',
    );
  });
  it('шапка «Загальна інформація» не вважається ПІБ', () => {
    expect(findName('Загальна Інформація\nДосвід\nТекст')).toBeUndefined();
  });
  it('ПІБ з назви файлу, якщо в тексті не знайдено', () => {
    expect(findName('Текст без імені\n', 'Іваненко_Петро_резюме.pdf')).toBe('Іваненко Петро');
    expect(nameFromFileName('резюме-шевченко-олена-ігорівна.pdf')).toBe('Шевченко Олена Ігорівна');
    expect(nameFromFileName('CV Petro Ivanenko (1).docx')).toBe('Ivanenko Petro');
    expect(nameFromFileName('scan0001.pdf')).toBeUndefined();
    expect(parseResumeText('', 'Іваненко_Петро.pdf')).toEqual({ full_name: 'Іваненко Петро' });
  });
});

describe('назва файлу резюме', () => {
  it('з датою завантаження', () => {
    expect(resumeDisplayName('Іваненко Петро Миколайович', 'scan.pdf', 1, '2026-11-24T08:00:00Z')).toBe(
      'Іваненко Петро Миколайович — резюме від 24.11.2026.pdf',
    );
  });
  it('за ПІБ кандидата', () => {
    expect(resumeDisplayName('Іваненко Петро', 'scan_0001.PDF')).toBe('Іваненко Петро — резюме.pdf');
    expect(resumeDisplayName('Іваненко Петро', 'cv.docx', 2)).toBe('Іваненко Петро — резюме (2).docx');
    expect(resumeDisplayName('Ім"я/з:символами', 'a.pdf')).toBe('Ім я з символами — резюме.pdf');
  });

  it('Work.ua: ПІБ склеєний з датою резюме, посада в наступному рядку', () => {
    const t = 'Сервіс пошуку роботи №1 в Україні\nРезюме від 25 листопада 2026Афонська Наталія\nБухгалтер з первинної документації, помічник бухгалтера\nВид зайнятості: повна\nЗарплата: 52 000 грн/міс';
    const r = parseResumeText(t, 'x.docx');
    expect(r.full_name).toBe('Афонська Наталія');
    expect(r.current_position).toBe('Бухгалтер з первинної документації, помічник бухгалтера');
  });

  it('Work.ua: ПІБ у кінці назви файлу', () => {
    expect(nameFromFileName('Workua резюме — Бухгалтер з первинної документації, помічник бухгалтера, Наталія Афонська 8809874.docx')).toBe('Афонська Наталія');
  });
});
