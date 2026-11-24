'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { translateError } from '@/lib/errors';
import { GoogleNotConnected, googleSession } from '@/lib/google';
import { collectFolders, downloadDriveFile, folderIdFromLink, resolveFolder, searchBank, type BankConfig, type BankFilters, type DriveFile } from '@/lib/drive';
import { importResume, type ImportResult } from '../candidates/actions';
import { RESUME_TYPES } from '@/lib/validation';

function gErr(e: unknown): string {
  if (e instanceof GoogleNotConnected) return e.message;
  const m = e instanceof Error ? e.message : 'Помилка Google';
  if (/insufficient|scope|403/i.test(m)) return 'Немає доступу до Google Диска: перепідключіть Google у профілі (з дозволом на Диск) і переконайтеся, що папка архіву відкрита для вашої пошти';
  if (/notFound|404/i.test(m)) return 'Папку архіву не знайдено або вона не відкрита для вашого Google-акаунта';
  return m;
}

async function config(): Promise<BankConfig | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'resume_bank').maybeSingle();
  return (data?.value as BankConfig | undefined) ?? null;
}

// ---------------------------------------------------------------------
// Налаштування (адміністратор): папка архіву на Google Диску
// ---------------------------------------------------------------------
export async function saveBankFolder(link: string): Promise<{ ok?: string; error?: string }> {
  const folderId = folderIdFromLink(link);
  if (!folderId) return { error: 'Вставте посилання на папку Google Диска (drive.google.com/drive/folders/…)' };
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc('check_permission', { p_code: 'settings.manage', p_require_mfa: true });
  if (allowed !== true) return { error: 'Недостатньо прав' };
  const { data: auth } = await supabase.auth.getUser();
  try {
    const session = await googleSession(auth.user!.id);
    const folder = await resolveFolder(session, folderId);
    const { folders, truncated } = folder.driveId ? { folders: [folder.id], truncated: false } : await collectFolders(session, folder.id);
    const value: BankConfig = { folderId: folder.id, folderName: folder.name, driveId: folder.driveId, folders, truncated, updatedAt: new Date().toISOString() };
    const { error } = await supabase.from('app_settings').upsert({ key: 'resume_bank', value }, { onConflict: 'key' });
    if (error) return { error: translateError(error) };
    revalidatePath('/settings/resume-bank');
    revalidatePath('/resume-bank');
    return {
      ok: folder.driveId
        ? `Підключено спільний диск «${folder.name}»`
        : `Підключено папку «${folder.name}»: ${folders.length} папок і підпапок${truncated ? ' (дуже багато підпапок — пошук іде по всьому Диску)' : ''}`,
    };
  } catch (e) {
    return { error: gErr(e) };
  }
}

// ---------------------------------------------------------------------
// Пошук і додавання в базу кандидатів
// ---------------------------------------------------------------------
export type BankResult = DriveFile & { candidateId: string | null };

export async function searchResumeBank(filters: BankFilters, pageToken?: string | null): Promise<{ error?: string; files?: BankResult[]; next?: string | null }> {
  const cfg = await config();
  if (!cfg) return { error: 'Адміністратор ще не підключив папку архіву (Налаштування → Банк резюме)' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Сесія завершилася' };
  try {
    const session = await googleSession(auth.user.id);
    const { files, nextPageToken } = await searchBank(session, cfg, filters, pageToken ?? undefined);
    // Які файли вже додано в базу кандидатів
    const refs = files.map((f) => `drive:${f.id}`);
    const { data: docs } = refs.length
      ? await supabase.from('documents').select('source_ref, candidate_id').in('source_ref', refs).is('deleted_at', null)
      : { data: [] };
    const byRef = new Map(((docs ?? []) as { source_ref: string; candidate_id: string }[]).map((d) => [d.source_ref, d.candidate_id]));
    return { files: files.map((f) => ({ ...f, candidateId: byRef.get(`drive:${f.id}`) ?? null })), next: nextPageToken };
  } catch (e) {
    return { error: gErr(e) };
  }
}

export async function addFromBank(fileId: string, vacancyId?: string | null): Promise<ImportResult> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return { status: 'error', message: 'Невірний файл' };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: 'error', message: 'Сесія завершилася' };
  try {
    const session = await googleSession(auth.user.id);
    const dl = await downloadDriveFile(session, fileId);
    // Файли на Диску часто без розширення в назві — визначаємо його за типом
    const BY_MIME: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/rtf': 'rtf',
      'text/rtf': 'rtf',
      'text/plain': 'txt',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    };
    let name = dl.name;
    let ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    if (!(ext in RESUME_TYPES) && BY_MIME[dl.mimeType]) {
      ext = BY_MIME[dl.mimeType];
      name = `${name}.${ext}`;
    }
    const bytes = dl.bytes;
    if (!(ext in RESUME_TYPES)) return { status: 'error', message: 'Цей формат файлу не підтримується для додавання в базу' };
    const data = new FormData();
    data.set('resume', new File([new Uint8Array(bytes)], name, { type: RESUME_TYPES[ext] }));
    data.set('source_ref', `drive:${fileId}`);
    if (vacancyId) data.set('vacancy_id', vacancyId);
    const result = await importResume(data);
    revalidatePath('/resume-bank');
    return result;
  } catch (e) {
    return { status: 'error', message: gErr(e) };
  }
}
