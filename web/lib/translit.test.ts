import { describe, expect, it } from 'vitest';
import { latinName, translitUk } from './translit';

describe('транслітерація (КМУ 2010)', () => {
  it('офіційні приклади', () => {
    expect(translitUk('Згурський')).toBe('Zghurskyi');
    expect(translitUk('Юрій')).toBe('Yurii');
    expect(translitUk('Ярошенко')).toBe('Yaroshenko');
    expect(translitUk('Їжакевич')).toBe('Yizhakevych');
    expect(translitUk('Короп’є')).toBe('Koropie');
    expect(translitUk('Гаврилюк')).toBe('Havryliuk');
    expect(translitUk('Щербухи')).toBe('Shcherbukhy');
  });
  it('прізвище та ім’я з ПІБ', () => {
    expect(latinName('Жогло Дмитро Петрович')).toBe('Zhohlo Dmytro');
    expect(latinName('Іванова Ольга')).toBe('Ivanova Olha');
    expect(latinName('Мельник-Коваль Анна')).toBe('Melnyk-Koval Anna');
  });
});
