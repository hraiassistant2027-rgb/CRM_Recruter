// Транслітерація українських імен латиницею за офіційними правилами (постанова КМУ № 55 від 27.01.2010).
// Використовується для «Прізвище Ім'я латиницею» у заявці IT (облікові записи, пошта).

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ю: 'iu', я: 'ia', ь: '', "'": '', '’': '', 'ʼ': '', '`': '',
  // російські літери в іменах
  ы: 'y', э: 'e', ё: 'io', ъ: '',
};
// На початку слова
const FIRST: Record<string, string> = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };

function word(w: string): string {
  const lower = w.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    // «зг» передається як «zgh» (Згурський → Zghurskyi)
    if (ch === 'г' && lower[i - 1] === 'з') {
      out += 'gh';
      continue;
    }
    out += i === 0 && FIRST[ch] ? FIRST[ch] : MAP[ch] ?? ch;
  }
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

export function translitUk(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.split('-').map(word).join('-'))
    .join(' ');
}

// «Прізвище Ім'я По батькові» → «Prizvyshche Imia» (лише прізвище та ім'я)
export function latinName(fullName: string): string {
  return translitUk(fullName.trim().split(/\s+/).slice(0, 2).join(' '));
}
