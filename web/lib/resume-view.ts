import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { docxToSafeHtml } from '@/lib/resume-text';
import { ensurePreview } from '@/lib/preview';

type Supa = Awaited<ReturnType<typeof createClient>>;
export type ResumeDoc = { id: string; storage_bucket: string; storage_path: string; preview_path: string | null; source_ref: string | null; original_name: string };

// Як показати резюме в браузері: Google Диск, PDF-копія, сам файл або безпечний HTML із Word
export type ResumeView =
  | { kind: 'iframe'; src: string; name: string; id: string }
  | { kind: 'img'; src: string; name: string; id: string }
  | { kind: 'html'; html: string; name: string; id: string }
  | { kind: 'none'; name: string; id: string; ext: string };

export async function resumeView(supabase: Supa, userId: string, doc: ResumeDoc): Promise<ResumeView> {
  const ext = doc.original_name.split('.').pop()?.toLowerCase() ?? '';
  const base = { name: doc.original_name, id: doc.id };
  const { data: g } = await supabase.from('email_accounts').select('status, scopes').eq('user_id', userId).maybeSingle();
  const scopes = (g as { status: string; scopes: string[] } | null)?.status === 'active' ? ((g as { scopes: string[] }).scopes ?? []) : [];
  const driveId = doc.source_ref?.startsWith('drive:') && scopes.some((s) => s.includes('drive')) ? doc.source_ref.slice(6) : null;
  if (driveId) return { kind: 'iframe', src: `https://drive.google.com/file/d/${driveId}/preview`, ...base };
  let previewPath = doc.preview_path;
  if (!previewPath && ['doc', 'docx', 'rtf'].includes(ext) && scopes.some((s) => s.endsWith('drive.file'))) {
    previewPath = await ensurePreview(doc, userId);
  }
  if (previewPath) return { kind: 'iframe', src: `/api/documents/${doc.id}?preview=1`, ...base };
  if (['pdf', 'txt'].includes(ext)) return { kind: 'iframe', src: `/api/documents/${doc.id}`, ...base };
  if (['jpg', 'jpeg', 'png'].includes(ext)) return { kind: 'img', src: `/api/documents/${doc.id}`, ...base };
  if (ext === 'docx') {
    const { data: blob } = await createAdminClient().storage.from(doc.storage_bucket).download(doc.storage_path);
    if (blob) {
      const html = await docxToSafeHtml(new Uint8Array(await blob.arrayBuffer()));
      await supabase.rpc('log_event', { p_action: 'view_file', p_entity: 'documents', p_entity_id: doc.id, p_details: null });
      if (html) return { kind: 'html', html, ...base };
    }
  }
  return { kind: 'none', ext, ...base };
}
