// Розпізнавання основних даних кандидата з тексту резюме (без зовнішніх сервісів).
// Правила розраховані на українські та російськомовні резюме з Work.ua, robota.ua, LinkedIn і довільні.
// Результат — лише підказка: поля заповнюються, рекрутер перевіряє і зберігає.

export type ResumeFields = {
  full_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  desired_salary?: string;
  salary_currency?: 'UAH' | 'USD' | 'EUR';
  current_position?: string;
  linkedin_url?: string;
};

const UP = 'A-ZА-ЯІЇЄҐЁЫЭЪ';
const LOW = "a-zа-яіїєґёыэъ'’ʼ`-";

// Слова, які трапляються в першому рядку, але не є ПІБ
const NOT_NAME = new Set(
  [
    'резюме', 'curriculum', 'vitae', 'cv', 'resume', 'контакти', 'контакты', 'contacts', 'про', 'себе', 'досвід', 'опыт',
    'роботи', 'работы', 'освіта', 'образование', 'навички', 'навыки', 'мета', 'цель', 'бажана', 'желаемая', 'посада',
    'должность', 'інженер', 'инженер', 'менеджер', 'прораб', 'виконроб', 'майстер', 'мастер', 'водій', 'водитель',
    'україна', 'украина', 'ukraine', 'київ', 'киев', 'kyiv', 'work', 'robota', 'linkedin', 'telegram', 'viber', 'phone',
    'email', 'телефон', 'дата', 'народження', 'рождения', 'громадянство', 'гражданство', 'summary', 'experience',
    'education', 'skills', 'profile', 'objective', 'personal', 'information', 'особисті', 'дані', 'личные', 'данные',
  ].map((w) => w.toLowerCase()),
);

// Великі міста України у різних написаннях -> назва українською
const CITIES: [RegExp, string][] = [
  [/(?<!\p{L})(київ|киев|kyiv|kiev)/iu, 'Київ'],
  [/(?<!\p{L})(харків|харьков|kharkiv|kharkov)/iu, 'Харків'],
  [/(?<!\p{L})(одес[аіи]|odesa|odessa)/iu, 'Одеса'],
  [/(?<!\p{L})(дніпр[оі]|днепр|dnipro|дніпропетровськ|днепропетровск)/iu, 'Дніпро'],
  [/(?<!\p{L})(льв[іо]в|lviv)/iu, 'Львів'],
  [/(?<!\p{L})(запоріжж|запорож|zaporizhzhia)/iu, 'Запоріжжя'],
  [/(?<!\p{L})(кривий ріг|кривой рог|kryvyi rih)/iu, 'Кривий Ріг'],
  [/(?<!\p{L})(миколаїв|николаев|mykolaiv)/iu, 'Миколаїв'],
  [/(?<!\p{L})(вінниц|винниц|vinnytsia)/iu, 'Вінниця'],
  [/(?<!\p{L})(полтав|poltava)/iu, 'Полтава'],
  [/(?<!\p{L})(чернігів|чернигов|chernihiv)/iu, 'Чернігів'],
  [/(?<!\p{L})(черкас|cherkasy)/iu, 'Черкаси'],
  [/(?<!\p{L})(житомир|zhytomyr)/iu, 'Житомир'],
  [/(?<!\p{L})(суми|сумы|sumy)(?!\p{L})/iu, 'Суми'],
  [/(?<!\p{L})(хмельницьк|хмельницк|khmelnytskyi)/iu, 'Хмельницький'],
  [/(?<!\p{L})(чернівц|черновц|chernivtsi)/iu, 'Чернівці'],
  [/(?<!\p{L})(рівне|ровно|rivne)(?!\p{L})/iu, 'Рівне'],
  [/(?<!\p{L})(івано-франківськ|ивано-франковск|ivano-frankivsk)/iu, 'Івано-Франківськ'],
  [/(?<!\p{L})(тернопіль|тернополь|ternopil)/iu, 'Тернопіль'],
  [/(?<!\p{L})(луцьк|луцк|lutsk)/iu, 'Луцьк'],
  [/(?<!\p{L})(ужгород|uzhhorod)/iu, 'Ужгород'],
  [/(?<!\p{L})(кропивницьк|кропивницк|kropyvnytskyi)/iu, 'Кропивницький'],
  [/(?<!\p{L})(біла церква|белая церковь|bila tserkva)/iu, 'Біла Церква'],
  [/(?<!\p{L})(бровар|brovary)/iu, 'Бровари'],
  [/(?<!\p{L})(бориспіль|борисполь|boryspil)/iu, 'Бориспіль'],
  [/(?<!\p{L})(ірпін|ирпень|irpin)/iu, 'Ірпінь'],
  [/(?<!\p{L})(буча|bucha)(?!\p{L})/iu, 'Буча'],
  [/(?<!\p{L})(кременчук|кременчуг|kremenchuk)/iu, 'Кременчук'],
  [/(?<!\p{L})(кам'янське|каменское|kamianske)/iu, "Кам'янське"],
  [/(?<!\p{L})(херсон|kherson)/iu, 'Херсон'],
  [/(?<!\p{L})(маріуполь|мариуполь|mariupol)/iu, 'Маріуполь'],
];

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join('-');
}

function cleanLines(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function findEmail(text: string): string | undefined {
  return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]?.toLowerCase();
}

export function findPhone(text: string): string | undefined {
  // +380 67 123 45 67, 067-123-45-67, (067) 1234567, 38 067 123 4567
  const re = /(?:\+?\s*3\s*8\s*[\s(.-]*)?\(?\s*0\s*\d\s*\d\s*\)?[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d[\s.-]*\d/g;
  for (const m of text.matchAll(re)) {
    const digits = m[0].replace(/\D/g, '');
    const local = digits.startsWith('380') ? digits.slice(2) : digits.startsWith('80') ? digits.slice(1) : digits;
    if (/^0\d{9}$/.test(local)) {
      return `+38 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
    }
  }
  return undefined;
}

export function findLinkedIn(text: string): string | undefined {
  const m = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i)?.[0];
  if (!m) return undefined;
  return m.startsWith('http') ? m : `https://${m}`;
}

export function findName(text: string): string | undefined {
  const lines = cleanLines(text).slice(0, 15);
  // Підписане поле має пріоритет
  for (const line of lines) {
    const labeled = line.match(/^(?:ПІБ|ПІП|ФІО|ФИО|Ім'я|Имя|Name|Full name)\s*[:—-]\s*(.+)$/i);
    if (labeled) {
      const n = nameFromLine(labeled[1]);
      if (n) return n;
    }
  }
  for (const line of lines) {
    const n = nameFromLine(line);
    if (n) return n;
  }
  return undefined;
}

function nameFromLine(line: string): string | undefined {
  const cleaned = line.replace(/[,.;|•·]+$/g, '').trim();
  const words = cleaned.split(' ');
  if (words.length < 2 || words.length > 3) return undefined;
  const word = new RegExp(`^[${UP}][${UP}${LOW}]{1,30}$`);
  if (!words.every((w) => word.test(w))) return undefined;
  if (words.some((w) => NOT_NAME.has(w.toLowerCase()))) return undefined;
  // Змішаний алфавіт в одному слові — не ім'я
  if (words.some((w) => /[A-Za-z]/.test(w) && /[А-Яа-яІіЇїЄєҐґ]/.test(w))) return undefined;
  return words.map(titleCase).join(' ');
}

export function findCity(text: string): string | undefined {
  const lines = cleanLines(text).slice(0, 60);
  const labelRe =
    /(?:місто|город|city|location|місце проживання|место проживания|проживаю|проживання|проживание|адреса|адрес|address)\s*[:—-]?\s*(?:м\.|г\.|місто|город)?\s*([^,;|\n]{2,40})/i;
  for (const line of lines) {
    const m = line.match(labelRe);
    if (m) {
      const known = CITIES.find(([re]) => re.test(m[1]));
      if (known) return known[1];
      const raw = m[1].trim().split(/\s+/).slice(0, 2).join(' ');
      if (new RegExp(`^[${UP}][${LOW}]+(?: [${UP}][${LOW}]+)?$`).test(raw)) return raw;
    }
  }
  const head = lines.slice(0, 25).join(' ');
  const prefixed = head.match(new RegExp(`(?:^|\\s)(?:м\\.|г\\.)\\s*([${UP}][${LOW}]+(?:[ -][${UP}][${LOW}]+)?)`));
  if (prefixed) return CITIES.find(([re]) => re.test(prefixed[1]))?.[1] ?? prefixed[1];
  for (const [re, name] of CITIES) if (re.test(head)) return name;
  return undefined;
}

export function findSalary(text: string): Pick<ResumeFields, 'desired_salary' | 'salary_currency'> {
  const flat = text.replace(/\s+/g, ' ');
  const label =
    /(?:бажана зарплата|бажаний рівень|зарплатні очікування|очікування по з\/?п|очікувана зарплата|зарплата|зарплатня|з\/п|зп|желаемая зарплата|ожидания по зарплате|зарплатные ожидания|оклад|salary(?: expectations?)?|expected salary)\s*[:—-]?\s*(?:від|от|from)?\s*([$€]?\s?\d[\d\s.,]{2,10})\s*(грн|uah|₴|usd|\$|дол|eur|€|євро|евро)?/i;
  let m = flat.match(label);
  if (!m) {
    // Work.ua: "Бажана посада, 25 000 грн" — сума з валютою в перших рядках
    const head = cleanLines(text).slice(0, 8).join(' ');
    m = head.match(/()(\d{1,3}(?:[\s ]\d{3})+|\d{4,6})\s*(грн|uah|₴|\$|usd|eur|€)/i);
    if (m) m = [m[0], m[2], m[3]] as unknown as RegExpMatchArray;
  }
  if (!m) return {};
  const raw = m[1];
  const curRaw = (m[2] ?? (raw.includes('$') ? '$' : raw.includes('€') ? '€' : '')).toLowerCase();
  const amount = Number(raw.replace(/[^\d]/g, ''));
  if (!Number.isFinite(amount) || amount < 100 || amount > 10_000_000) return {};
  const currency: ResumeFields['salary_currency'] = /usd|\$|дол/.test(curRaw) ? 'USD' : /eur|€|євро|евро/.test(curRaw) ? 'EUR' : 'UAH';
  return { desired_salary: String(amount), salary_currency: currency };
}

export function findPosition(text: string): string | undefined {
  for (const line of cleanLines(text).slice(0, 40)) {
    const m = line.match(/^(?:бажана посада|посада|желаемая должность|должность|position|desired position|job title)\s*[:—-]\s*(.{2,80})$/i);
    if (m) return m[1].replace(/,?\s*\d[\d\s]*\s*(грн|uah|\$|usd|eur|€).*$/i, '').trim();
  }
  return undefined;
}

export function parseResumeText(text: string): ResumeFields {
  if (!text || text.trim().length < 20) return {};
  const out: ResumeFields = {
    full_name: findName(text),
    phone: findPhone(text),
    email: findEmail(text),
    city: findCity(text),
    current_position: findPosition(text),
    linkedin_url: findLinkedIn(text),
    ...findSalary(text),
  };
  for (const k of Object.keys(out) as (keyof ResumeFields)[]) if (!out[k]) delete out[k];
  return out;
}

export const FIELD_LABELS: Record<keyof ResumeFields, string> = {
  full_name: 'ПІБ',
  phone: 'телефон',
  email: 'email',
  city: 'місто',
  desired_salary: 'зарплата',
  salary_currency: 'валюта',
  current_position: 'посада',
  linkedin_url: 'LinkedIn',
};

// Назва файлу резюме за ПІБ кандидата: "Іваненко Петро — резюме.pdf", для другого файлу — "(2)"
export function resumeDisplayName(fullName: string, originalName: string, index = 1): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'pdf';
  const base = fullName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Кандидат';
  return `${base} — резюме${index > 1 ? ` (${index})` : ''}.${ext}`;
}
