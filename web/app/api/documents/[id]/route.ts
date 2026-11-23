import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation';

// Видача файлу резюме: права перевіряє база (RLS documents), посилання діє 5 хвилин,
// кожне відкриття фіксується в журналі дій.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL('/login', request.url));

  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_bucket, storage_path, original_name, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (!doc || doc.deleted_at) return new NextResponse('Файл не знайдено або немає доступу', { status: 404 });

  const download = request.nextUrl.searchParams.get('download') === '1';
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 300, download ? { download: doc.original_name } : undefined);
  if (error || !signed) return new NextResponse('Не вдалося відкрити файл', { status: 502 });

  await supabase.rpc('log_event', {
    p_action: download ? 'download_file' : 'view_file',
    p_entity: 'documents',
    p_entity_id: doc.id,
    p_details: null,
  });

  const response = NextResponse.redirect(signed.signedUrl, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
