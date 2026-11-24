// Шаблони листів і формат повідомлень Gmail. Без залежностей від сервера — тестується окремо.

export type TemplateVars = Record<string, string | null | undefined>;

export const VARIABLE_LABELS: Record<string, string> = {
  'candidate.first_name': "Ім'я кандидата",
  'candidate.full_name': 'ПІБ кандидата',
  'vacancy.title': 'Назва вакансії',
  'recruiter.name': "Ім'я рекрутера",
  'recruiter.phone': 'Телефон рекрутера',
  'recruiter.email': 'Email рекрутера',
  'interview.date': 'Дата співбесіди',
  'interview.time': 'Час співбесіди',
  'interview.location': 'Місце співбесіди',
  'offer.details': 'Умови оффера',
  'offer.deadline': 'Термін відповіді на оффер',
};

// Ім'я з ПІБ у порядку «Прізвище Ім'я По батькові»
export function firstNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length >= 2 ? parts[1] : parts[0] ?? '';
}

// Підстановка змінних; незаповнені лишаються як [Назва змінної], щоб рекрутер їх помітив
export function fillTemplate(text: string, vars: TemplateVars): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    if (value && value.trim()) return value.trim();
    missing.add(key);
    return `[${VARIABLE_LABELS[key] ?? key}]`;
  });
  return { text: out, missing: [...missing] };
}

export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\[([^\]\n]{2,40})\]/g)].map((m) => m[1]))].filter((label) =>
    Object.values(VARIABLE_LABELS).includes(label),
  );
}

// HTML шаблону -> звичайний текст для редагування
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Текст -> безпечний HTML: абзаци і переноси рядків, усе інше екрановано
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

// Лист у форматі RFC 2822 (текст + HTML), закодований для Gmail API
export function buildRawEmail(input: { fromEmail: string; fromName?: string; to: string; subject: string; text: string; html: string }): string {
  const boundary = `crm_${Math.random().toString(36).slice(2)}`;
  const from = input.fromName ? `${encodeHeader(input.fromName.replace(/["\r\n]/g, ''))} <${input.fromEmail}>` : input.fromEmail;
  const to = input.to.replace(/[\r\n,;<>]/g, '');
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(input.subject.replace(/[\r\n]+/g, ' '))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(input.text, 'utf8').toString('base64')),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(`<!doctype html><html><body>${input.html}</body></html>`, 'utf8').toString('base64')),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

// ---------------------------------------------------------------------
// Розбір листів Gmail
// ---------------------------------------------------------------------
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };

export function headerOf(part: GmailPart, name: string): string | undefined {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

export function bodyOf(part: GmailPart): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;
  const walk = (p: GmailPart) => {
    const data = p.body?.data ? Buffer.from(p.body.data, 'base64url').toString('utf8') : null;
    if (data && p.mimeType === 'text/plain' && text === null) text = data;
    if (data && p.mimeType === 'text/html' && html === null) html = data;
    p.parts?.forEach(walk);
  };
  walk(part);
  return { text, html };
}

export function emailsIn(header: string | undefined): string[] {
  if (!header) return [];
  return [...header.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase());
}

// Розкодування HTML-сутностей (Gmail повертає короткий опис листа в такому вигляді)
export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Текст відповіді без цитати попереднього листа.
// Заголовок цитати («…, 24 лист. 2026 р. о 12:57 Ім'я <email> пише:») Gmail часто переносить на 2 рядки.
const QUOTE_END = /(wrote|пише|написав|написала|писал|написал|пишет)\s*:\s*$/i;
const QUOTE_DATE_LINE = /\d{4}.*<[^>\s]+@[^>\s]+>\s*$/;

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const cut = lines.findIndex((l, i) => {
    const next = (lines[i + 1] ?? '').trim();
    return (
      /^>/.test(l) ||
      QUOTE_END.test(l) ||
      (QUOTE_DATE_LINE.test(l) && (next === '' || QUOTE_END.test(next) || next.startsWith('>'))) ||
      /^-{2,}\s*(Original Message|Пересланий|Исходное)/i.test(l)
    );
  });
  return (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim();
}
