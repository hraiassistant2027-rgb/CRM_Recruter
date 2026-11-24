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
    'загальна', 'общая', 'інформація', 'информация', 'контактна', 'контактная', 'особа', 'лицо', 'додаткова', 'дополнительная',
    'ключові', 'ключевые', 'професійні', 'профессиональные', 'знання', 'знания', 'мови', 'языки', 'languages', 'локація',
    'локация', 'оновлено', 'обновлено', 'вакансія', 'вакансия', 'компанія', 'компания', 'тов', 'фоп', 'пп', 'прат', 'ооо',
    'сертифікати', 'курси', 'курсы', 'рекомендації', 'рекомендации', 'хобі', 'хобби', 'інтереси', 'интересы', 'досягнення',
  ].map((w) => w.toLowerCase()),
);

// Поширені імена (укр., рос., латиницею) — щоб визначити порядок «Ім'я Прізвище» і переставити на «Прізвище Ім'я»
const FIRST_NAMES = new Set(
  (
    'олександр александр олексій алексей андрій андрей анатолій анатолий антон артем артём богдан борис вадим валентин валерій валерий ' +
    'василь василий віктор виктор віталій виталий владислав владимир володимир в\'ячеслав вячеслав геннадій геннадий георгій георгий ' +
    'григорій григорий данило даниил денис дмитро дмитрий євген евгений егор єгор іван иван ігор игорь ілля илья йосип кирило кирилл ' +
    'костянтин константин леонід леонид максим марко микола николай михайло михаил назар олег остап павло павел петро петр роман ' +
    'руслан сергій сергей станіслав станислав степан тарас тимофій тимур федір федор юрій юрий ярослав яків яков ' +
    'алла аліна алина алла анастасія анастасия ганна анна антоніна антонина валентина валерія валерия вероніка вероника вікторія виктория ' +
    'галина дарина дарья діана диана євгенія евгения єлизавета елизавета олена елена жанна зоя інна инна ірина ирина катерина екатерина ' +
    'кристина лариса леся лілія лилия любов любовь людмила маргарита марина марія мария мирослава надія надежда наталія наталья наталия ' +
    'неля оксана ольга поліна полина раїса раиса світлана светлана софія софия тамара тетяна татьяна уляна ульяна христина юлія юлия яна ' +
    'oleksandr alexander alex oleksii alexey andrii andriy andrey anatolii anton artem bohdan bogdan borys denys denis dmytro dmitry ' +
    'yevhen eugene ivan ihor igor illia ilya kyrylo kostiantyn maksym maxim mykola mykhailo michael nazar oleh oleg ostap pavlo petro ' +
    'roman ruslan serhii sergey sergii stanislav taras yurii yuriy vadym vadim vasyl viktor victor vitalii volodymyr vladimir yaroslav ' +
    'alina anastasiia anna hanna daria diana olena elena kateryna iryna irina khrystyna kristina larysa liudmyla maryna mariia maria ' +
    'nataliia natalia oksana olha olga sofiia sofia svitlana tetiana tatiana yuliia yulia yana viktoriia victoria valeriia'
  ).split(/\s+/),
);

const PATRONYMIC = /(ович|евич|йович|ьович|івна|ївна|овна|евна|ична|інічна|ich|ivna|ovych|ovna)$/i;
const SURNAME_END = /(енко|ко|ук|юк|чук|ський|цький|ська|цька|зький|ов|ова|ев|ева|єв|єва|ін|іна|ин|ина|ич|ак|як|ець|ій|enko|uk|iuk|yuk|chuk|skyi|ska|sky|ov|ova|ev|eva|in|ina|ych)$/i;

// Порядок для картки: Прізвище Ім'я По батькові
export function toSurnameFirst(words: string[]): string[] {
  if (words.length === 3) {
    // Ім'я По-батькові Прізвище -> Прізвище Ім'я По-батькові
    if (PATRONYMIC.test(words[1]) && !PATRONYMIC.test(words[2])) return [words[2], words[0], words[1]];
    return words;
  }
  if (words.length === 2) {
    const [a, b] = words;
    const aFirst = FIRST_NAMES.has(a.toLowerCase());
    const bFirst = FIRST_NAMES.has(b.toLowerCase());
    if (aFirst && !bFirst) return [b, a];
    if (!aFirst && !bFirst && SURNAME_END.test(b) && !SURNAME_END.test(a)) return [b, a];
  }
  return words;
}

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

export function findName(text: string, fileName?: string): string | undefined {
  const lines = cleanLines(text).slice(0, 40);
  // 1. Підписане поле: «ПІБ: …», «Ім'я: …»
  for (const line of lines) {
    const labeled = line.match(/^(?:ПІБ|ПІП|ФІО|ФИО|Прізвище,? ім'я(?:,? по батькові)?|Ім'я|Имя|Name|Full name)\s*[:—-]\s*(.+)$/i);
    if (labeled) {
      const n = nameFromLine(labeled[1]);
      if (n) return n;
    }
  }
  // 2. Рядок, схожий на ПІБ, у якому є відоме ім'я або по батькові (перші 40 рядків)
  for (const line of lines) {
    const n = nameFromLine(line, true);
    if (n) return n;
  }
  // 3. Окремий рядок з 2–3 слів з великої літери на самому початку резюме
  for (const line of lines.slice(0, 6)) {
    const n = nameFromLine(line);
    if (n) return n;
  }
  // 4. Назва файлу: «Іваненко_Петро_резюме.pdf», «CV Petro Ivanenko.docx»
  if (fileName) {
    const fromFile = nameFromFileName(fileName);
    if (fromFile) return fromFile;
  }
  // 5. Будь-де в тексті: 2–3 слова поспіль, серед яких відоме ім'я або по батькові
  for (const line of cleanLines(text).slice(0, 200)) {
    const words = line.normalize('NFC').split(/[\s,;|•·:()]+/).filter(Boolean);
    for (let i = 0; i < words.length - 1; i++) {
      const three = i + 2 < words.length ? [words[i], words[i + 1], words[i + 2]] : null;
      if (three && three.some((w) => PATRONYMIC.test(fixLookalikes(w)))) {
        const n = nameFromLine(three.join(' '), true);
        if (n) return n;
      }
      const n = nameFromLine(`${words[i]} ${words[i + 1]}`, true);
      if (n) return n;
    }
  }
  return undefined;
}

export function nameFromFileName(fileName: string): string | undefined {
  const base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_.+]+/g, ' ')
    .replace(/(?<!\p{L})(резюме|резюме_|cv|resume|curriculum|vitae|копія|копия|copy|final|new|нове|оновлене|updated)(?!\p{L})/giu, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[()\[\]-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return undefined;
  // Назви файлів часто з малої літери: «іваненко петро»
  const words = base.split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w));
  return nameFromLine(words.slice(0, 3).join(' ')) ?? (words.length > 2 ? nameFromLine(words.slice(0, 2).join(' ')) : undefined);
}

// Деякі PDF кодують кириличні «і», «а», «о»… латинськими літерами — повертаємо кирилицю
const LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', i: 'і', o: 'о', p: 'р', x: 'х', y: 'у',
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
};
function fixLookalikes(word: string): string {
  return /[А-Яа-яІіЇїЄєҐґ]/.test(word) ? word.replace(/[aceiopxyABCEHIKMOPTX]/g, (ch) => LOOKALIKE[ch] ?? ch) : word;
}

function looksLikePerson(words: string[]): boolean {
  return words.some((w) => FIRST_NAMES.has(w.toLowerCase()) || PATRONYMIC.test(w));
}

function nameFromLine(line: string, requirePerson = false): string | undefined {
  // «Іваненко Петро, 35 років», «Іваненко Петро | Прораб», «Іваненко Петро — інженер»
  const cleaned = line
    .split(/\s*[,;|•·–—(]\s*|\s+-\s+|\s+\d/)[0]
    .replace(/[.:]+$/g, '')
    .trim();
  const words = cleaned.normalize('NFC').split(' ').map(fixLookalikes);
  if (words.length < 2 || words.length > 3) return undefined;
  if (requirePerson && !looksLikePerson(words)) return undefined;
  const word = new RegExp(`^[${UP}][${UP}${LOW}]{1,30}$`);
  if (!words.every((w) => word.test(w))) return undefined;
  if (words.some((w) => NOT_NAME.has(w.toLowerCase()))) return undefined;
  // Змішаний алфавіт в одному слові — не ім'я
  if (words.some((w) => /[A-Za-z]/.test(w) && /[А-Яа-яІіЇїЄєҐґ]/.test(w))) return undefined;
  return toSurnameFirst(words.map(titleCase)).join(' ');
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

// Перші рядки тексту — щоб показати рекрутеру, що «бачить» система, коли ПІБ не знайдено
export function firstLines(text: string, count = 6): string[] {
  return cleanLines(text)
    .slice(0, count)
    .map((l) => (l.length > 90 ? `${l.slice(0, 90)}…` : l));
}

export function parseResumeText(text: string, fileName?: string): ResumeFields {
  if (!text || text.trim().length < 20) {
    const fromFile = fileName ? nameFromFileName(fileName) : undefined;
    return fromFile ? { full_name: fromFile } : {};
  }
  const out: ResumeFields = {
    full_name: findName(text, fileName),
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

// Назва файлу резюме за ПІБ кандидата і датою завантаження:
// "Іваненко Петро Миколайович — резюме від 24.11.2026.pdf", для другого файлу — "(2)"
export function resumeDisplayName(fullName: string, originalName: string, index = 1, uploadedAt?: string | Date | null): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'pdf';
  const base = fullName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Кандидат';
  const date = uploadedAt
    ? ` від ${new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' }).format(new Date(uploadedAt))}`
    : '';
  return `${base} — резюме${date}${index > 1 ? ` (${index})` : ''}.${ext}`;
}
