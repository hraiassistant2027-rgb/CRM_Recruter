// Переклад помилок Supabase Auth і бази для користувача (без технічних подробиць)

type ErrorLike = { code?: string | null; message?: string | null; status?: number | null; name?: string | null } | null | undefined;

const RULES: { test: (code: string, msg: string) => boolean; text: string }[] = [
  { test: (c, m) => c === 'invalid_credentials' || m.includes('invalid login credentials'), text: 'Невірний email або пароль' },
  { test: (c, m) => c === 'user_banned' || m.includes('banned'), text: 'Доступ заблоковано адміністратором' },
  { test: (c, m) => c === 'email_not_confirmed' || m.includes('email not confirmed'), text: 'Email ще не підтверджено. Скористайтеся посиланням із запрошення' },
  { test: (c, m) => c.includes('rate_limit') || m.includes('rate limit') || m.includes('too many'), text: 'Забагато спроб. Зачекайте кілька хвилин і спробуйте знову' },
  { test: (c, m) => c === 'same_password' || m.includes('should be different'), text: 'Новий пароль має відрізнятися від попереднього' },
  { test: (c, m) => c === 'weak_password' || m.includes('password should'), text: 'Пароль надто простий: щонайменше 12 символів, літери і цифри' },
  { test: (c, m) => c === 'mfa_verification_failed' || c === 'invalid_code' || m.includes('invalid totp') || m.includes('invalid code'), text: 'Невірний код. Перевірте, що час на телефоні правильний, і введіть свіжий код' },
  { test: (c, m) => c === 'otp_expired' || m.includes('token has expired') || m.includes('invalid or has expired'), text: 'Посилання застаріло або вже використане. Попросіть надіслати нове' },
  { test: (c, m) => c === 'mfa_challenge_expired' || m.includes('expired'), text: 'Час дії коду минув. Введіть новий код' },
  { test: (c, m) => c === 'insufficient_aal' || m.includes('aal2'), text: 'Підтвердьте вхід кодом із застосунку-автентифікатора' },
  { test: (c, m) => c === 'email_exists' || c === 'user_already_exists' || m.includes('already been registered'), text: 'Користувач із таким email вже існує' },
  { test: (c, m) => c === '42501' || m.includes('permission denied') || m.includes('row-level security') || m.includes('немає права'), text: 'Недостатньо прав для цієї дії' },
  { test: (c, m) => m.includes('invalid api key') || m.includes('no api key') || c === 'invalid_api_key', text: 'Сайт неправильно налаштований: невірний ключ Supabase (змінні на Render)' },
  { test: (_c, m) => m.includes('fetch failed') || m.includes('enotfound') || m.includes('failed to fetch'), text: 'Не вдалося з\'єднатися з базою: перевірте адресу Supabase (змінні на Render)' },
  { test: (_c, m) => m.includes('database error'), text: 'Помилка бази під час входу. Зверніться до адміністратора' },
  { test: (_c, m) => m.includes('останнього super admin'), text: 'Не можна заблокувати або позбавити ролі останнього SUPER ADMIN' },
];

export function translateError(err: ErrorLike): string {
  if (!err) return 'Сталася помилка. Спробуйте ще раз';
  const code = (err.code ?? '').toLowerCase();
  const msg = (err.message ?? '').toLowerCase();
  const known = RULES.find((r) => r.test(code, msg))?.text;
  // Повний текст — лише в журнал сервера (Render → Logs); користувачу — короткий код для діагностики
  console.error('[crm-error]', { code: err.code, status: err.status, name: err.name, message: err.message });
  if (known) return known;
  // Пояснення з перевірок самої бази (написані українською) показуємо як є
  if (['23514', 'p0001', 'p0002', '22023', '02000'].includes(code) && /[а-яіїєґ]/i.test(err.message ?? '')) return err.message!;
  const ref = [err.status, err.code || err.name].filter(Boolean).join(' / ');
  return `Сталася помилка. Спробуйте ще раз або зверніться до адміністратора${ref ? ` (код: ${ref})` : ''}`;
}
