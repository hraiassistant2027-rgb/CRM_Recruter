import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
import { applyToCandidate, inactiveState, robotaApplies, robotaLogin, robotaVacancies } from './robota';

afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('robota.ua', () => {
  it('вхід повертає токен у різних форматах відповіді', async () => {
    vi.stubGlobal('fetch', reply('"eyJhbGciOiJIUzI1NiJ9.payload.signature"'));
    expect(await robotaLogin('hr@kan.ua', 'x')).toBe('eyJhbGciOiJIUzI1NiJ9.payload.signature');
    vi.stubGlobal('fetch', reply({ token: 'eyJhbGciOiJIUzI1NiJ9.other.sig' }));
    expect(await robotaLogin('hr@kan.ua', 'x')).toBe('eyJhbGciOiJIUzI1NiJ9.other.sig');
  });

  it('невірний пароль — зрозуміла помилка', async () => {
    vi.stubGlobal('fetch', reply({ message: 'bad' }, 401));
    await expect(robotaLogin('hr@kan.ua', 'x')).rejects.toThrow(/логін або пароль/);
  });

  it('список вакансій і відгуків', async () => {
    vi.stubGlobal('fetch', reply({ vacancies: [{ id: 101, name: 'Прораб', state: 'Publicated', cityName: 'Київ' }, { vacancyId: 0 }] }));
    expect(await robotaVacancies('t')).toEqual([{ id: 101, name: 'Прораб', state: 'Publicated', city: 'Київ' }]);
    vi.stubGlobal('fetch', reply({ applies: [{ id: 7, name: 'Іван' }] }));
    expect((await robotaApplies('t', 101, 0)).map((a) => a.id)).toEqual([7]);
  });

  it('закриті вакансії не перевіряємо', () => {
    expect(inactiveState('Closed')).toBe(true);
    expect(inactiveState('Publicated')).toBe(false);
    expect(inactiveState(null)).toBe(false);
  });

  it('відгук → поля картки', () => {
    const r = applyToCandidate({
      id: 1,
      resumeId: 555,
      name: ' Петренко Іван ',
      eMail: 'ivan@test.ua',
      phones: [{ value: '+380 (67) 123-45-67' }],
      speciality: 'Прораб',
      cityName: 'Київ',
      salary: 40000,
      skillsSummary: '<p>AutoCAD,&nbsp;кошториси</p>',
      experiences: [
        { position: 'Майстер', company: 'Буд', dateFrom: '2020-01-01T00:00:00', dateTo: '2022-01-01T00:00:00', description: '<b>Нагляд</b>' },
        { position: '', company: '' },
      ],
    });
    expect(r.raw.full_name).toBe('Петренко Іван');
    expect(r.raw.phone).toBe('+380 (67) 123-45-67');
    expect(r.raw.desired_salary).toBe('40000');
    expect(r.raw.summary).toContain('AutoCAD, кошториси');
    expect(r.raw.summary).toContain('https://robota.ua/candidates/555');
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0]).toMatchObject({ position: 'Майстер', start: '2020-01-01', end: '2022-01-01', description: 'Нагляд' });
    expect(r.months).toBeGreaterThan(23);
  });

  it('відгук без імені', () => {
    expect(applyToCandidate({ id: 2, experiences: [{ dateFrom: '0001-01-01T00:00:00', position: 'X' }] }).raw.full_name).toBe('Без імені (robota.ua)');
  });
});
