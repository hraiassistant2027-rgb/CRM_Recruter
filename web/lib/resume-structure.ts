// Етап 9: розбір структури резюме — досвід роботи, освіта, навички, «про себе», джерело резюме.
// Працює без зовнішніх сервісів, за правилами для резюме Work.ua, robota.ua, LinkedIn і довільних.
import { unglue } from './resume-parse';

export type ParsedExperience = { position: string | null; company: string | null; start: string | null; end: string | null; description: string | null };
export type ParsedEducation = { institution: string; degree: string | null; speciality: string | null; year_end: number | null };
export type ResumeStructure = {
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: string[];
  summary: string | null;
  totalMonths: number | null;
  source: 'Work.ua' | 'robota.ua' | 'LinkedIn' | null;
};

// ---------------------------------------------------------------------
// Розділи резюме
// ---------------------------------------------------------------------
const H_EXPERIENCE = /^(досвід роботи|досвід|трудова діяльність|місця роботи|опыт работы|опыт|трудовая деятельность|work experience|professional experience|experience|employment history)$/i;
const H_EDUCATION = /^(освіта|вища освіта|образование|education)$/i;
const H_SKILLS = /^(знання і навички|знання та навички|ключові навички|професійні навички|навички|компетенції|знания и навыки|ключевые навыки|профессиональные навыки|навыки|skills|key skills|top skills|основні навички|hard skills)$/i;
const H_SUMMARY = /^(додаткова інформація|про себе|про мене|особисті якості|дополнительная информация|о себе|личные качества|about me|summary|profile|профіль|профиль)$/i;
const H_OTHER = /^(знання мов|мови|володіння мовами|знание языков|языки|languages|курси|курси та сертифікати|курсы|сертифікати|сертификаты|certifications|тренінги|рекомендації|рекомендации|references|хобі|хобби|hobbies|інтереси|интересы|контакти|контакты|contact|контактна інформація|бажана посада|желаемая должность|досягнення|достижения|achievements|honors-awards|publications|volunteer)$/i;

function headerKind(line: string): 'exp' | 'edu' | 'skills' | 'summary' | 'other' | null {
  const l = line.replace(/[:：]\s*$/, '').trim();
  if (l.length > 40) return null;
  if (H_EXPERIENCE.test(l)) return 'exp';
  if (H_EDUCATION.test(l)) return 'edu';
  if (H_SKILLS.test(l)) return 'skills';
  if (H_SUMMARY.test(l)) return 'summary';
  if (H_OTHER.test(l)) return 'other';
  return null;
}

function linesOf(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => unglue(l.replace(/[ \t ]+/g, ' ').trim()))
    .filter(Boolean);
}

function sections(lines: string[]) {
  const out: Record<'exp' | 'edu' | 'skills' | 'summary', string[]> = { exp: [], edu: [], skills: [], summary: [] };
  let cur: keyof typeof out | null = null;
  const seen = new Set<string>();
  for (const line of lines) {
    const k = headerKind(line);
    if (k) {
      // Беремо перший розділ кожного типу (у LinkedIn «Experience» може повторюватися в колонтитулах)
      cur = k !== 'other' && !seen.has(k) ? k : null;
      if (k !== 'other') seen.add(k);
      continue;
    }
    if (cur) out[cur].push(line);
  }
  return out;
}

// ---------------------------------------------------------------------
// Дати
// ---------------------------------------------------------------------
const MONTHS: [RegExp, number][] = [
  [/^(січ|янв|jan)/i, 1], [/^(лют|фев|feb)/i, 2], [/^(бер|мар|mar)/i, 3], [/^(кві|апр|apr)/i, 4],
  [/^(тра|мая|май|may)/i, 5], [/^(чер|июн|jun)/i, 6], [/^(лип|июл|jul)/i, 7], [/^(сер|авг|aug)/i, 8],
  [/^(вер|сен|sep)/i, 9], [/^(жов|окт|oct)/i, 10], [/^(лис|ноя|nov)/i, 11], [/^(гру|дек|dec)/i, 12],
];
const MONTH_WORD = '(?:січ\\p{L}*|лют\\p{L}*|берез\\p{L}*|квіт\\p{L}*|трав\\p{L}*|черв\\p{L}*|лип\\p{L}*|серп\\p{L}*|верес\\p{L}*|жовт\\p{L}*|листопад\\p{L}*|груд\\p{L}*|январ\\p{L}*|феврал\\p{L}*|март\\p{L}*|апрел\\p{L}*|ма[йя]|июн\\p{L}*|июл\\p{L}*|август\\p{L}*|сентябр\\p{L}*|октябр\\p{L}*|ноябр\\p{L}*|декабр\\p{L}*|jan\\p{L}*|feb\\p{L}*|mar\\p{L}*|apr\\p{L}*|may|jun\\p{L}*|jul\\p{L}*|aug\\p{L}*|sep\\p{L}*|oct\\p{L}*|nov\\p{L}*|dec\\p{L}*)\\.?';
const DATE = `(?:${MONTH_WORD}\\s+(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])[./](?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const PRESENT =
  '(?:теперішній час|теперішнього часу|цей час|цього часу|сьогодні|сьогоднішній день|дотепер|нині|зараз|т\\.\\s?ч\\.|наст(?:оящее|\\.)\\s?(?:время|вр\\.)|настоящего времени|сей день|сегодня|нынешнее время|present|now|current)';
const RANGE = new RegExp(
  `(?:^|[\\s(])(?:з|із|с|from)?\\s*(${DATE})\\s*(?:[-–—]+|по|до|to|till|until)\\s*(?:по\\s+|до\\s+)?(${DATE}|${PRESENT})`,
  'iu',
);

function parseDate(s: string, end = false): string | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(0?[1-9]|1[0-2])[./]((?:19|20)\d{2})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  m = t.match(/^(\p{L}+)\.?\s+((?:19|20)\d{2})$/u);
  if (m) {
    const month = MONTHS.find(([re]) => re.test(m![1]))?.[1];
    if (month) return `${m[2]}-${String(month).padStart(2, '0')}-01`;
  }
  m = t.match(/^((?:19|20)\d{2})$/);
  if (m) return `${m[1]}-${end ? '12' : '01'}-01`;
  return null;
}

export function findRange(line: string): { start: string | null; end: string | null; rest: string } | null {
  const m = line.match(RANGE);
  if (!m) return null;
  const start = parseDate(m[1]);
  const presentRe = new RegExp(`^${PRESENT}$`, 'iu');
  const end = presentRe.test(m[2].trim()) ? null : parseDate(m[2], true);
  if (!start) return null;
  if (end && end < start) return null;
  const rest = line
    .replace(m[0], ' ')
    .replace(/\(\s*\d+[^)]*\)/g, ' ') // «(7 років 8 місяців)»
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .trim();
  return { start, end, rest };
}

// ---------------------------------------------------------------------
// Досвід роботи
// ---------------------------------------------------------------------
const COMPANY = /(?<!\p{L})(тов|тзов|пп|фоп|прат|пат|ат|дп|кп|ооо|чп|оао|зао|llc|ltd|inc|gmbh|corp|компанія|компания|група|группа|холдинг|завод|корпорація|корпорация|банк)(?!\p{L})|[«"“][^»"”]{2,}[»"”]/iu;
const BULLET = /^[-–—•·*▪●◦✓]\s*/;

function isDescriptionLike(line: string): boolean {
  return BULLET.test(line) || line.length > 90 || /[.;]$/.test(line) || /^(обов|функц|досягн|обязан|достиж|responsib|achiev|duties|tasks|задачі|завдання)/i.test(line);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function parseExperience(sectionLines: string[], companyFirst = false): ParsedExperience[] {
  const idx = sectionLines.map((l, i) => (findRange(l) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  const plain = (l: string | undefined) => l !== undefined && !isDescriptionLike(l) && !findRange(l) && l.length <= 160;
  // Формат визначаємо за першим місцем роботи:
  //  «до дати» (robota.ua, LinkedIn): посада, компанія, дати;  «після дати» (Work.ua): посада, дати, компанія
  const before = idx[0] >= 2 && plain(sectionLines[idx[0] - 1]) && plain(sectionLines[idx[0] - 2]);

  return idx.map((i, k) => {
    const r = findRange(sectionLines[i])!;
    const prevLimit = k > 0 ? idx[k - 1] : -1;
    const nextHeadStart = k + 1 < idx.length ? idx[k + 1] - (before ? 2 : 1) : sectionLines.length;
    let position: string | null = null;
    let company: string | null = null;
    let to = i;
    if (before) {
      const l1 = i - 1 > prevLimit ? sectionLines[i - 1] : undefined;
      const l2 = i - 2 > prevLimit ? sectionLines[i - 2] : undefined;
      if (plain(l1) && plain(l2)) {
        [position, company] = companyFirst ? [l1!, l2!] : [l2!, l1!];
      } else if (plain(l1)) {
        position = l1!;
      }
    } else {
      const l1 = i - 1 > prevLimit ? sectionLines[i - 1] : undefined;
      if (plain(l1)) position = l1!;
      const n = sectionLines[i + 1];
      if (plain(n) && i + 1 < nextHeadStart) {
        company = n!;
        to = i + 1;
      }
    }
    if (r.rest.length > 2) {
      // Дата і назва в одному рядку: «2015–2019 ТОВ «Альфа», інженер»
      if (COMPANY.test(r.rest) && !company) company = r.rest;
      else if (!position) position = r.rest;
      else if (!company) company = r.rest;
    }
    const desc = sectionLines.slice(to + 1, Math.max(to + 1, nextHeadStart)).join('\n').trim();
    return {
      position: position ? clip(position.replace(/[,;:]+$/, ''), 200) : null,
      company: company ? clip(company.replace(/[,;:]+$/, ''), 200) : null,
      start: r.start,
      end: r.end,
      description: desc ? clip(desc, 1500) : null,
    };
  });
}

// Загальний стаж у місяцях (перетини періодів не рахуються двічі)
export function totalMonths(items: { start: string | null; end: string | null }[], today = new Date()): number | null {
  const toN = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
  const nowN = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const spans = items
    .filter((i) => i.start)
    .map((i) => [toN(i.start!), Math.min(nowN, i.end ? toN(i.end) : nowN) + 1] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return null;
  let total = 0;
  let [cs, ce] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return total > 0 && total < 12 * 70 ? total : null;
}

// ---------------------------------------------------------------------
// Освіта
// ---------------------------------------------------------------------
const INSTITUTION = /(університет|университет|інститут|институт|академі|академи|коледж|колледж|технікум|техникум|училищ|ліце[йю]|лице[йя]|політехні|политехни|консерваторі|university|college|institute|academy|school|кпі|кнеу|кну)/i;
const DEGREE = /(неповна вища|незакінчена вища|неполное высшее|незаконченное высшее|середня спеціальна|среднее специальное|середня технічна|професійно-технічна|вища|высшее|середня|среднее|молодший спеціаліст|младший специалист|бакалавр|магістр|магистр|спеціаліст|специалист|кандидат наук|доктор наук|phd|bachelor'?s?|master'?s?)/i;

export function parseEducation(sectionLines: string[]): ParsedEducation[] {
  const out: ParsedEducation[] = [];
  for (let i = 0; i < sectionLines.length && out.length < 6; i++) {
    const line = sectionLines[i];
    if (!INSTITUTION.test(line) || line.length > 160 || BULLET.test(line)) continue;
    const item: ParsedEducation = { institution: clip(line.replace(/[,;]+$/, ''), 200), degree: null, speciality: null, year_end: null };
    // «Університет …, вища» — ступінь у тому ж рядку після коми
    const tail = line.match(new RegExp(`,\\s*${DEGREE.source}\\s*$`, 'i'));
    if (tail) {
      item.degree = tail[1][0].toUpperCase() + tail[1].slice(1).toLowerCase();
      item.institution = clip(line.slice(0, tail.index).trim(), 200);
    }
    for (let j = i + 1; j <= i + 3 && j < sectionLines.length; j++) {
      let l = sectionLines[j];
      if (INSTITUTION.test(l) && !DEGREE.test(l)) break;
      const years = [...l.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)].map((m) => Number(m[1]));
      if (years.length) {
        const y = Math.max(...years);
        if (y >= 1950 && y <= 2100) item.year_end = y;
        const range = findRange(l);
        l = (range ? range.rest : l.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ' '))
          .replace(/[()·]/g, ' ')
          .replace(/^(з|с|по|до)\s+|\s+(з|с|по|до)$/gi, '')
          .replace(/\s+/g, ' ')
          .replace(/^[\s,;–—-]+|[\s,;–—-]+$/g, '')
          .trim();
        if (l.replace(/[^\p{L}]/gu, '').length < 3) continue;
      }
      const deg = l.match(DEGREE);
      if (deg) {
        item.degree ??= deg[1][0].toUpperCase() + deg[1].slice(1).toLowerCase();
        const spec = l.replace(deg[0], '').replace(/\bdegree\b/i, '').replace(/^[\s,;–—-]+|[\s,;–—-]+$/g, '').trim();
        if (spec.length > 2) item.speciality ??= clip(spec, 200);
        continue;
      }
      if (!item.speciality && l.length <= 150 && !BULLET.test(l)) item.speciality = clip(l.replace(/[,;]+$/, ''), 200);
    }
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------
// Навички і «про себе»
// ---------------------------------------------------------------------
export function parseSkills(sectionLines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of sectionLines) {
    for (const part of line.replace(BULLET, '').split(/\s*[,;•·|▪●]\s*/)) {
      const s = part.replace(BULLET, '').replace(/[.:]+$/, '').trim();
      if (s.length < 2 || s.length > 60 || s.split(/\s+/).length > 6) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 30) return out;
    }
  }
  return out;
}

export function detectSource(text: string, fileName = ''): ResumeStructure['source'] {
  const head = `${fileName}\n${text.slice(0, 3000)}`;
  if (/work\.?\s?ua|сервіс пошуку роботи №\s?1|сервис поиска работы №\s?1/i.test(head)) return 'Work.ua';
  if (/robota\.?\s?ua|rabota\.?\s?ua|робота\.юа/i.test(head)) return 'robota.ua';
  if (/linkedin\.com\/in\//i.test(text) && /(top skills|основні навички|page \d+ of \d+)/i.test(text)) return 'LinkedIn';
  return null;
}

export function parseResumeStructure(text: string, fileName = '', today = new Date()): ResumeStructure {
  const lines = linesOf(text ?? '');
  const sec = sections(lines);
  const source = detectSource(text ?? '', fileName);
  const experience = parseExperience(sec.exp, source === 'LinkedIn').slice(0, 15);
  const summary = sec.summary.join('\n').trim();
  return {
    experience,
    education: parseEducation(sec.edu),
    skills: parseSkills(sec.skills),
    summary: summary ? clip(summary, 2000) : null,
    totalMonths: totalMonths(experience, today),
    source,
  };
}
