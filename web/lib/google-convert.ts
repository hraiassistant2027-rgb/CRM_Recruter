import 'server-only';
import { randomBytes } from 'node:crypto';
import { googleFetch, googleSession, type GoogleSession } from '@/lib/google';

// Конвертація файлу резюме через Google Диск рекрутера:
//  - текст із фото, сканів і старих .doc (Google розпізнає текст, мова — українська);
//  - PDF-копія Word/RTF для перегляду в оригінальному вигляді.
// Тимчасовий файл створюється в Диску користувача і одразу видаляється.

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const API = 'https://www.googleapis.com/drive/v3/files';
const CONVERTIBLE: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export const PREVIEW_EXTS = ['doc', 'docx', 'rtf'];

export function canConvert(ext: string): boolean {
  return ext in CONVERTIBLE;
}

export async function convertViaDrive(
  session: GoogleSession,
  bytes: Uint8Array,
  ext: string,
  want: { text: boolean; pdf: boolean },
): Promise<{ text: string | null; pdf: Buffer | null }> {
  const mime = CONVERTIBLE[ext];
  if (!mime || (!want.text && !want.pdf)) return { text: null, pdf: null };
  const boundary = `kan_${randomBytes(8).toString('hex')}`;
  const meta = JSON.stringify({ name: `kan-talent-tmp-${Date.now()}`, mimeType: 'application/vnd.google-apps.document' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await googleFetch<{ id: string }>(session, `${UPLOAD}?uploadType=multipart&ocrLanguage=uk&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  try {
    const exportAs = async (type: string) => {
      const res = await fetch(`${API}/${created.id}/export?mimeType=${encodeURIComponent(type)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) throw new Error(`Google Диск: експорт HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    };
    const text = want.text ? (await exportAs('text/plain')).toString('utf8').replace(/^﻿/, '').trim() : null;
    const pdf = want.pdf ? await exportAs('application/pdf') : null;
    return { text: text && text.length >= 20 ? text.slice(0, 200_000) : null, pdf };
  } finally {
    await fetch(`${API}/${created.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.accessToken}` } }).catch(() => undefined);
  }
}

// Те саме від імені користувача; без підключеного Google — тихо нічого не робить
export async function convertForUser(
  userId: string | null | undefined,
  bytes: Uint8Array,
  ext: string,
  want: { text: boolean; pdf: boolean },
): Promise<{ text: string | null; pdf: Buffer | null }> {
  if (!userId || !canConvert(ext)) return { text: null, pdf: null };
  try {
    const session = await googleSession(userId);
    return await convertViaDrive(session, bytes, ext, want);
  } catch (e) {
    console.error('[google-convert]', ext, e instanceof Error ? e.message : e);
    return { text: null, pdf: null };
  }
}
