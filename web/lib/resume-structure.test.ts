import { describe, expect, it } from 'vitest';
import { detectSource, findRange, parseResumeStructure, totalMonths } from './resume-structure';

const today = new Date('2026-11-25');

describe('структура резюме', () => {
  it('Work.ua: досвід, освіта, навички, «про себе», джерело', () => {
    const t = [
      'Сервіс пошуку роботи №1 в Україні', 'Резюме від 25 листопада 2026 Афонська Наталія',
      'Досвід роботи', 'Бухгалтер', 'з 03.2019 по 11.2026 (7 років 8 місяців)', 'ТОВ «Альфа Буд», Київ (Будівництво)',
      'Ведення первинної документації.', 'Помічник бухгалтера', 'з 09.2015 по 02.2019 (3 роки 6 місяців)', 'Епіцентр К, Київ',
      'Освіта', 'Київський національний економічний університет', 'Облік і аудит, Вища', 'з 2001 по 2006 (5 років)',
      'Знання і навички', '1С: Бухгалтерія', 'MS Excel', 'Податкова звітність, M.E.Doc',
      'Додаткова інформація', 'Відповідальна.',
    ].join('\n');
    const r = parseResumeStructure(t, 'Workua резюме.docx', today);
    expect(r.source).toBe('Work.ua');
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0]).toMatchObject({ position: 'Бухгалтер', company: 'ТОВ «Альфа Буд», Київ (Будівництво)', start: '2019-03-01', end: '2026-11-01' });
    expect(r.experience[1]).toMatchObject({ position: 'Помічник бухгалтера', company: 'Епіцентр К, Київ' });
    expect(r.education[0]).toMatchObject({ speciality: 'Облік і аудит', degree: 'Вища', year_end: 2006 });
    expect(r.skills).toEqual(['1С: Бухгалтерія', 'MS Excel', 'Податкова звітність', 'M.E.Doc']);
    expect(r.summary).toBe('Відповідальна.');
  });

  it('robota.ua: посада і компанія перед датами, «по теперішній час»', () => {
    const t = 'Досвід роботи\nПрораб\nПП "БудМайстер"\nберезень 2020 — по теперішній час\n- керування бригадою\nМайстер\nКиївміськбуд\nсічень 2016 — лютий 2020\nОсвіта\nНаціональний авіаційний університет\nПромислове та цивільне будівництво\n2010 – 2015';
    const r = parseResumeStructure(t, 'cv.pdf', today);
    expect(r.experience[0]).toMatchObject({ position: 'Прораб', company: 'ПП "БудМайстер"', start: '2020-03-01', end: null, description: '- керування бригадою' });
    expect(r.experience[1]).toMatchObject({ position: 'Майстер', company: 'Київміськбуд' });
    expect(r.education[0]).toMatchObject({ speciality: 'Промислове та цивільне будівництво', year_end: 2015 });
  });

  it('LinkedIn: компанія перед посадою', () => {
    const t = 'Contact\nwww.linkedin.com/in/x\nTop Skills\nExperience\nKAN Development\nProject Manager\nJanuary 2021 - Present (5 years)\nEducation\nKyiv Polytechnic Institute\nMaster\'s degree, Civil Engineering · (2011 - 2017)\nPage 1 of 2';
    const r = parseResumeStructure(t, 'Profile.pdf', today);
    expect(r.source).toBe('LinkedIn');
    expect(r.experience[0]).toMatchObject({ position: 'Project Manager', company: 'KAN Development' });
    expect(r.education[0]).toMatchObject({ speciality: 'Civil Engineering', year_end: 2017 });
  });

  it('дати і стаж без подвійного рахунку', () => {
    expect(findRange('с мая 2018 по настоящее время')).toMatchObject({ start: '2018-05-01', end: null });
    expect(findRange('2015 - 2019')).toMatchObject({ start: '2015-01-01', end: '2019-12-01' });
    expect(totalMonths([{ start: '2020-01-01', end: '2020-12-01' }, { start: '2020-06-01', end: '2021-05-01' }], today)).toBe(17);
    expect(detectSource('звичайне резюме', 'cv.pdf')).toBe(null);
  });
});
