import { describe, expect, it } from 'vitest';
import { findCity, findPhone, parseResumeText, resumeDisplayName } from './resume-parse';

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
    expect(r).toMatchObject({ full_name: 'Olena Shevchenko', city: 'Київ', phone: '+38 093 555 44 33', desired_salary: '2500', salary_currency: 'USD' });
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

describe('назва файлу резюме', () => {
  it('за ПІБ кандидата', () => {
    expect(resumeDisplayName('Іваненко Петро', 'scan_0001.PDF')).toBe('Іваненко Петро — резюме.pdf');
    expect(resumeDisplayName('Іваненко Петро', 'cv.docx', 2)).toBe('Іваненко Петро — резюме (2).docx');
    expect(resumeDisplayName('Ім"я/з:символами', 'a.pdf')).toBe('Ім я з символами — резюме.pdf');
  });
});
