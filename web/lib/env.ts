// Змінні середовища. NEXT_PUBLIC_* потрапляють у браузер — там лише публічні значення.

export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Не задано NEXT_PUBLIC_SUPABASE_URL або NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  // Лише адреса проєкту, без шляхів на зразок /rest/v1/ (їх додає бібліотека Supabase сама)
  let origin = url.trim();
  try {
    origin = new URL(origin).origin;
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL має бути адресою на зразок https://xxxx.supabase.co');
  }
  return { url: origin, key: key.trim() };
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// Секретний ключ Supabase — лише для серверних адмін-операцій (запрошення, блокування входу).
export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Не задано SUPABASE_SECRET_KEY');
  return key;
}
