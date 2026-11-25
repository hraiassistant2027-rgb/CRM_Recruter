import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { PREVIEW_EXTS, convertForUser } from '@/lib/google-convert';

// PDF-копія Word/RTF для перегляду в оригінальному вигляді. Для старих файлів створюється
// при першому перегляді (потрібен підключений Google переглядача). Викликати лише після того,
// як права на документ перевірено звичайним (не службовим) клієнтом.
export async function ensurePreview(
  doc: { id: string; storage_bucket: string; storage_path: string; original_name: string; preview_path: string | null },
  userId: string,
): Promise<string | null> {
  if (doc.preview_path) return doc.preview_path;
  const ext = doc.original_name.split('.').pop()?.toLowerCase() ?? '';
  if (!PREVIEW_EXTS.includes(ext)) return null;
  const admin = createAdminClient();
  const { data: blob } = await admin.storage.from(doc.storage_bucket).download(doc.storage_path);
  if (!blob) return null;
  const { pdf } = await convertForUser(userId, new Uint8Array(await blob.arrayBuffer()), ext, { text: false, pdf: true });
  if (!pdf) return null;
  const previewPath = `${doc.storage_path}.preview.pdf`;
  const { error } = await admin.storage.from(doc.storage_bucket).upload(previewPath, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) return null;
  await admin.from('documents').update({ preview_path: previewPath }).eq('id', doc.id);
  return previewPath;
}
