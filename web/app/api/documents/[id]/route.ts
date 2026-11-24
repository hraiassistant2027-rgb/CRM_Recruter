import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RESUME_TYPES, uuidSchema } from '@/lib/validation';
import { resumeDisplayName } from '@/lib/resume-parse';

// Видача файлу резюме через наш сайт: права перевіряє база (RLS documents),
// файл не має публічного посилання, кожне відкриття фіксується в журналі дій.
// Назва файлу — за ПІБ кандидата з картки.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: doc } = await supabase
    .from('documents')
    .select('id, candidate_id, storage_bucket, storage_path, original_name, mime_type, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (!doc || doc.deleted_at) return new NextResponse('Файл не знайдено або немає доступу', { status: 404 });

  let fileName = doc.original_name as string;
  if (doc.candidate_id) {
    const [{ data: candidate }, { data: siblings }] = await Promise.all([
      supabase.from('candidates').select('full_name').eq('id', doc.candidate_id).maybeSingle(),
      supabase.from('documents').select('id').eq('candidate_id', doc.candidate_id).is('deleted_at', null).order('created_at'),
    ]);
    const index = Math.max(1, (siblings ?? []).findIndex((s: { id: string }) => s.id === doc.id) + 1);
    if (candidate) fileName = resumeDisplayName(candidate.full_name, doc.original_name, index);
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from(doc.storage_bucket).download(doc.storage_path);
  if (error || !blob) return new NextResponse('Не вдалося відкрити файл', { status: 502 });

  const download = request.nextUrl.searchParams.get('download') === '1';
  await supabase.rpc('log_event', {
    p_action: download ? 'download_file' : 'view_file',
    p_entity: 'documents',
    p_entity_id: doc.id,
    p_details: null,
  });

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const type = RESUME_TYPES[ext] ?? 'application/octet-stream';
  const asciiName = `resume.${ext || 'bin'}`;
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': type === 'text/plain' ? 'text/plain; charset=utf-8' : type,
      'Content-Length': String(blob.size),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
