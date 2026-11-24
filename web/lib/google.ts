import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';

// Підключення Google-акаунта рекрутера (Gmail + Календар) через OAuth.
// Пароль від пошти CRM не бачить. Довгостроковий дозвіл (refresh token) зберігається
// зашифрованим AES-256-GCM і доступний лише серверу; браузер його ніколи не отримує.

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TOKEN_ENCRYPTION_KEY);
}

function clientId() {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error('Не задано GOOGLE_CLIENT_ID');
  return v.trim();
}
function clientSecret() {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error('Не задано GOOGLE_CLIENT_SECRET');
  return v.trim();
}
export function redirectUri() {
  return `${appUrl()}/api/google/callback`;
}

// ---------------------------------------------------------------------
// Шифрування токенів
// ---------------------------------------------------------------------
const KEY_ID = 'v1';

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) throw new Error('TOKEN_ENCRYPTION_KEY не задано або закороткий');
  return createHash('sha256').update(raw.trim()).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), data]);
  return `\\x${packed.toString('hex')}`; // формат bytea для PostgREST
}

export function decryptToken(stored: string): string {
  const hex = stored.startsWith('\\x') ? stored.slice(2) : stored;
  const packed = Buffer.from(hex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), packed.subarray(0, 12));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------
export function authorizationUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string; error?: string };

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google: ${json.error ?? res.status}`);
  return json;
}

// Email з id_token (отриманого напряму від Google через TLS — підпис не перевіряємо)
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as { email?: string; email_verified?: boolean };
    return payload.email && payload.email_verified !== false ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}

export class GoogleNotConnected extends Error {}

export type GoogleSession = { accountId: string; email: string; accessToken: string };

// Свіжий короткостроковий токен доступу для поточного користувача
export async function googleSession(userId: string): Promise<GoogleSession> {
  if (!googleConfigured()) throw new GoogleNotConnected('Інтеграцію з Google ще не налаштовано адміністратором');
  const admin = createAdminClient();
  const { data: account } = await admin
    .from('email_accounts')
    .select('id, google_email, refresh_token_encrypted, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (!account || account.status !== 'active' || !account.refresh_token_encrypted) {
    throw new GoogleNotConnected('Підключіть Google-акаунт у своєму профілі');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: decryptToken(account.refresh_token_encrypted),
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const revoked = json.error === 'invalid_grant';
    await admin
      .from('email_accounts')
      .update({ status: revoked ? 'revoked' : 'error', last_error: json.error ?? `HTTP ${res.status}` })
      .eq('id', account.id);
    throw new GoogleNotConnected(
      revoked ? 'Доступ до Google відкликано або він закінчився — підключіть акаунт у профілі знову' : 'Google тимчасово недоступний, спробуйте пізніше',
    );
  }
  return { accountId: account.id, email: account.google_email, accessToken: json.access_token };
}

export async function googleFetch<T>(session: GoogleSession, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* ignore */
    }
    if (res.status === 403 && /insufficient|scope/i.test(message)) {
      throw new GoogleNotConnected('Під час підключення не надано всі дозволи — підключіть Google у профілі знову і поставте всі галочки');
    }
    throw new Error(`Google: ${message}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
