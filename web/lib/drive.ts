import 'server-only';
import { googleFetch, type GoogleSession } from '@/lib/google';

// Банк резюме: пошук по папці архіву на Google Диску. Google сам індексує текст PDF, Word
// і розпізнає текст у сканах, тому архів не потрібно копіювати в CRM.

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
export const MAX_FOLDERS = 5000;

export type BankConfig = {
  folderId: string;
  folderName: string;
  driveId: string | null; // якщо архів — спільний диск
  folders: string[]; // папка архіву і всі її підпапки
  truncated: boolean;
  updatedAt: string;
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
};

export function folderIdFromLink(link: string): string | null {
  const s = link.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ?? s.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : null;
}

// Екранування значень у запиті пошуку Google Диска
export function q(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export async function resolveFolder(session: GoogleSession, folderId: string): Promise<{ id: string; name: string; driveId: string | null }> {
  const f = await googleFetch<{ id: string; name: string; mimeType: string; driveId?: string }>(
    session,
    `${API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,driveId&supportsAllDrives=true`,
  );
  if (f.mimeType !== FOLDER) throw new Error('Посилання веде не на папку');
  return { id: f.id, name: f.name, driveId: f.driveId && f.driveId === f.id ? f.driveId : null };
}

// Усі підпапки архіву (обхід у ширину, батчами по 30 батьківських папок)
export async function collectFolders(session: GoogleSession, rootId: string): Promise<{ folders: string[]; truncated: boolean }> {
  const all = [rootId];
  let frontier = [rootId];
  while (frontier.length && all.length < MAX_FOLDERS) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += 30) {
      const parents = frontier.slice(i, i + 30).map((id) => `${q(id)} in parents`).join(' or ');
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `mimeType = '${FOLDER}' and trashed = false and (${parents})`,
          fields: 'nextPageToken, files(id)',
          pageSize: '1000',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const res = await googleFetch<{ files: { id: string }[]; nextPageToken?: string }>(session, `${API}/files?${params}`);
        next.push(...res.files.map((f) => f.id));
        pageToken = res.nextPageToken;
      } while (pageToken && all.length + next.length < MAX_FOLDERS);
    }
    all.push(...next);
    frontier = next;
  }
  return { folders: all.slice(0, MAX_FOLDERS), truncated: all.length >= MAX_FOLDERS };
}

export type BankFilters = {
  text: string;
  position: string;
  city: string;
  skills: string;
  name: string;
  type: '' | 'pdf' | 'word' | 'image';
  since: string; // YYYY-MM-DD
  until: string;
};

const TYPES: Record<string, string> = {
  pdf: "mimeType = 'application/pdf'",
  word:
    "(mimeType = 'application/msword' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/rtf')",
  image: "(mimeType contains 'image/')",
};

export function buildQuery(f: BankFilters): string {
  const parts = ['trashed = false', `mimeType != '${FOLDER}'`];
  const phrases = [f.text, f.position, f.city, ...f.skills.split(',')].map((v) => v.trim()).filter(Boolean);
  for (const p of phrases.slice(0, 10)) parts.push(`fullText contains ${q(p.slice(0, 100))}`);
  if (f.name.trim()) parts.push(`name contains ${q(f.name.trim().slice(0, 100))}`);
  if (f.type && TYPES[f.type]) parts.push(TYPES[f.type]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.since)) parts.push(`modifiedTime >= '${f.since}T00:00:00'`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.until)) parts.push(`modifiedTime <= '${f.until}T23:59:59'`);
  return parts.join(' and ');
}

const FIELDS = 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, size, parents, webViewLink)';

// Пошук у межах архіву. Для звичайної папки шукаємо по Диску і відбираємо файли з папок архіву;
// для спільного диска Google обмежує пошук самим диском.
export async function searchBank(
  session: GoogleSession,
  cfg: BankConfig,
  filters: BankFilters,
  pageToken?: string,
): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const folderSet = new Set(cfg.folders);
  const query = buildQuery(filters);
  const found: DriveFile[] = [];
  let token = pageToken;
  for (let round = 0; round < 6; round++) {
    const params = new URLSearchParams({ q: query, fields: FIELDS, pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (cfg.driveId) {
      params.set('corpora', 'drive');
      params.set('driveId', cfg.driveId);
    }
    if (!query.includes('fullText')) params.set('orderBy', 'modifiedTime desc');
    if (token) params.set('pageToken', token);
    const res = await googleFetch<{ files: DriveFile[]; nextPageToken?: string }>(session, `${API}/files?${params}`);
    for (const file of res.files) {
      if (cfg.driveId || cfg.truncated || (file.parents ?? []).some((p) => folderSet.has(p))) found.push(file);
    }
    token = res.nextPageToken;
    if (!token || found.length >= 40) break;
  }
  return { files: found, nextPageToken: token ?? null };
}

// Завантаження файлу з Диска (Google Документи експортуються в PDF)
export async function downloadDriveFile(session: GoogleSession, fileId: string): Promise<{ name: string; bytes: Buffer; mimeType: string }> {
  const meta = await googleFetch<{ name: string; mimeType: string; size?: string }>(
    session,
    `${API}/files/${encodeURIComponent(fileId)}?fields=name,mimeType,size&supportsAllDrives=true`,
  );
  if (meta.size && Number(meta.size) > 20 * 1024 * 1024) throw new Error('Файл більший за 20 МБ');
  const isGoogleDoc = meta.mimeType === 'application/vnd.google-apps.document';
  const url = isGoogleDoc
    ? `${API}/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`
    : `${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!res.ok) throw new Error(`Google Диск: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = isGoogleDoc ? `${meta.name}.pdf` : meta.name;
  return { name, bytes, mimeType: isGoogleDoc ? 'application/pdf' : meta.mimeType };
}
