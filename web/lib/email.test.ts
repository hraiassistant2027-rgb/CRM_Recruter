import { describe, expect, it } from 'vitest';
import { bodyOf, decodeEntities, buildRawEmail, emailsIn, fillTemplate, findPlaceholders, firstNameOf, htmlToText, stripQuoted, textToHtml } from './email';

describe('шаблони листів', () => {
  it('ім’я з ПІБ у порядку Прізвище Ім’я По батькові', () => {
    expect(firstNameOf('Іваненко Петро Миколайович')).toBe('Петро');
    expect(firstNameOf('Петро')).toBe('Петро');
  });
  it('підстановка змінних і позначення незаповнених', () => {
    const r = fillTemplate('Добрий день, {{candidate.first_name}}! Вакансія {{vacancy.title}}, {{interview.date}}', {
      'candidate.first_name': 'Петро',
      'vacancy.title': 'Прораб',
    });
    expect(r.text).toBe('Добрий день, Петро! Вакансія Прораб, [Дата співбесіди]');
    expect(r.missing).toEqual(['interview.date']);
    expect(findPlaceholders(r.text)).toEqual(['Дата співбесіди']);
  });
  it('HTML шаблону -> текст -> безпечний HTML', () => {
    const text = htmlToText('<p>Добрий день!</p><p>Рядок 1<br>Рядок 2</p>');
    expect(text).toBe('Добрий день!\n\nРядок 1\nРядок 2');
    expect(textToHtml(text)).toBe('<p>Добрий день!</p>\n<p>Рядок 1<br>Рядок 2</p>');
    expect(textToHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});

describe('формат листа для Gmail', () => {
  it('українська тема і текст кодуються правильно, заголовки не можна підмінити', () => {
    const raw = buildRawEmail({
      fromEmail: 'hr@gmail.com',
      fromName: 'Усата Ганна',
      to: 'petro@ukr.net\r\nBcc: spy@evil.com',
      subject: 'Запрошення\r\nBcc: x@y.z',
      text: 'Добрий день',
      html: '<p>Добрий день</p>',
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: petro@ukr.netBcc: spy@evil.com');
    expect(decoded).not.toMatch(/^Bcc:/m);
    expect(decoded).toContain(`Subject: =?UTF-8?B?${Buffer.from('Запрошення Bcc: x@y.z').toString('base64')}?=`);
    expect(decoded).toContain(Buffer.from('Добрий день', 'utf8').toString('base64'));
  });
  it('кілька отримувачів через кому', () => {
    const raw = buildRawEmail({ fromEmail: 'hr@gmail.com', to: 'it1@kan.ua, it2@kan.ua', subject: 'Т', text: 'т', html: '<p>т</p>' });
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toContain('To: it1@kan.ua, it2@kan.ua');
  });
});

describe('розбір вхідних листів', () => {
  it('адреси, текст і відрізання цитати', () => {
    expect(emailsIn('Петро <Petro@Ukr.net>, hr@gmail.com')).toEqual(['petro@ukr.net', 'hr@gmail.com']);
    const body = bodyOf({
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Дякую, буду!').toString('base64url') } }],
    });
    expect(body.text).toBe('Дякую, буду!');
    expect(stripQuoted('Дякую, буду!\n\nпн, 24 лист. 2026 р. о 10:00 Ганна <hr@gmail.com> пише:\n> Запрошуємо')).toBe('Дякую, буду!');
    // Gmail переніс «пише:» на наступний рядок
    expect(stripQuoted('Дякую, завжди буду рада.\n\nвт, 24 лист. 2026 р. о 12:57 Usata Hanna <hr.ai.assistant.2027@gmail.com>\nпише:\n\n> Добрий день')).toBe(
      'Дякую, завжди буду рада.',
    );
    expect(decodeEntities('Ганна &lt;hr@gmail.com&gt; пише')).toBe('Ганна <hr@gmail.com> пише');
  });
});
