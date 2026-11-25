import { describe, expect, it } from 'vitest';
import { CUSTOM_MARKER, formatCustomValue, readCustomValues, type FieldDef } from './custom-fields';

const f = (code: string, type: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  id: code, code, name: code, type, is_required: false, options: [], help_text: null, show_in_list: false, sort_order: 0, archived_at: null, ...extra,
});
const form = (entries: [string, string][]) => {
  const fd = new FormData();
  fd.set(CUSTOM_MARKER, '1');
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe('власні поля', () => {
  it('без позначки форми — нічого не змінює', () => {
    expect(readCustomValues(new FormData(), [f('a', 'text')], { a: 'x' })).toBe(null);
  });
  it('читає і перевіряє значення різних типів', () => {
    const defs = [
      f('t', 'text'), f('n', 'money'), f('d', 'date'), f('b', 'boolean'),
      f('s', 'select', { options: ['B', 'C'] }), f('m', 'multiselect', { options: ['x', 'y'] }), f('u', 'url'),
    ];
    const r = readCustomValues(form([['cf_t', ' Привіт '], ['cf_n', '12 500,5'], ['cf_d', '2026-11-25'], ['cf_b', 'on'], ['cf_s', 'C'], ['cf_m', 'y'], ['cf_m', 'zzz'], ['cf_u', 'https://kan.ua']]), defs, null)!;
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({ t: 'Привіт', n: 12500.5, d: '2026-11-25', b: true, s: 'C', m: ['y'], u: 'https://kan.ua' });
  });
  it("обов'язкові і невірні значення дають помилки", () => {
    const defs = [f('r', 'text', { is_required: true }), f('s', 'select', { options: ['B'] }), f('e', 'email'), f('n', 'number')];
    const r = readCustomValues(form([['cf_s', 'Z'], ['cf_e', 'нема'], ['cf_n', 'abc']]), defs, null)!;
    expect(Object.keys(r.errors).sort()).toEqual(['cf_e', 'cf_n', 'cf_r', 'cf_s']);
  });
  it('значення прихованих полів зберігаються', () => {
    const r = readCustomValues(form([['cf_a', 'нове']]), [f('a', 'text'), f('old', 'text', { archived_at: '2026-01-01' })], { old: 'збережене' })!;
    expect(r.values).toEqual({ old: 'збережене', a: 'нове' });
  });
  it('показ значень', () => {
    expect(formatCustomValue({ type: 'boolean' }, false)).toBe('Ні');
    expect(formatCustomValue({ type: 'date' }, '2026-11-25')).toBe('25.11.2026');
    expect(formatCustomValue({ type: 'multiselect' }, ['B', 'C'])).toBe('B, C');
    expect(formatCustomValue({ type: 'text' }, null)).toBe('—');
  });
});
