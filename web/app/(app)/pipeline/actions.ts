'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { noteSchema, uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { resumeView, type ResumeDoc, type ResumeView } from '@/lib/resume-view';

export type QuickNote = { id: string; body: string; created_at: string; author: string | null };
export type QuickCandidate = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  current_position: string | null;
  resume: ResumeView | null;
  resumes: number;
  notes: QuickNote[];
};

// Перегляд резюме не повинен ламати панель: за помилки — посилання на сам файл
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// У швидкому перегляді резюме завжди показується на сторінці (а не завантажується):
// Word — як документ, решта — розпізнаний текст резюме; оригінал відкривається окремою кнопкою.
async function safeView(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, doc: ResumeDoc & { extracted_text?: string | null }): Promise<ResumeView> {
  try {
    const ext = doc.original_name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png'].includes(ext)) return { kind: 'img', src: `/api/documents/${doc.id}`, name: doc.original_name, id: doc.id };
    if (ext !== 'docx' && doc.extracted_text && doc.extracted_text.trim().length > 30) {
      const html = doc.extracted_text
        .replace(/\r/g, '')
        .split(/\n{2,}/)
        .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');
      return { kind: 'html', html, name: doc.original_name, id: doc.id };
    }
    return await resumeView(supabase, userId, doc);
  } catch (e) {
    console.error('quick view resume', doc.id, e);
    return { kind: 'none', name: doc.original_name, id: doc.id, ext: doc.original_name.split('.').pop()?.toLowerCase() ?? '' };
  }
}

// Швидкий перегляд із воронки: резюме і історія нотаток (дзвінків) без переходу в картку
export async function loadCandidateQuick(candidateId: string): Promise<{ data?: QuickCandidate; error?: string }> {
  const session = await requireSession();
  if (!uuidSchema.safeParse(candidateId).success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const [{ data: c }, { data: docs }, { data: notes }] = await Promise.all([
    supabase.from('candidates').select('id, full_name, phone, email, city, current_position').eq('id', candidateId).maybeSingle(),
    supabase
      .from('documents')
      .select('id, storage_bucket, storage_path, preview_path, source_ref, original_name, extracted_text')
      .eq('candidate_id', candidateId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('notes').select('id, body, created_at, author_id').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(50),
  ]);
  if (!c) return { error: 'Кандидата не знайдено або немає доступу' };
  const noteRows = (notes ?? []) as { id: string; body: string; created_at: string; author_id: string }[];
  const authorIds = [...new Set(noteRows.map((n) => n.author_id))];
  const { data: authors } = authorIds.length ? await supabase.from('profiles').select('id, full_name').in('id', authorIds) : { data: [] };
  const nameOf = new Map(((authors ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));
  const docList = (docs ?? []) as (ResumeDoc & { extracted_text: string | null })[];
  return {
    data: {
      ...(c as Omit<QuickCandidate, 'resume' | 'resumes' | 'notes'>),
      resume: docList[0] ? await safeView(supabase, session.userId, docList[0]) : null,
      resumes: docList.length,
      notes: noteRows.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: nameOf.get(n.author_id) ?? null })),
    },
  };
}

export async function addQuickNote(candidateId: string, applicationId: string | null, body: string): Promise<{ note?: QuickNote; error?: string }> {
  const session = await requireSession();
  if (!uuidSchema.safeParse(candidateId).success) return { error: 'Невірний кандидат' };
  if (applicationId && !uuidSchema.safeParse(applicationId).success) applicationId = null;
  const parsed = noteSchema.safeParse({ body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте текст' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notes')
    .insert({ candidate_id: candidateId, application_id: applicationId, body: parsed.data.body })
    .select('id, body, created_at')
    .single();
  if (error) return { error: translateError(error) };
  revalidatePath(`/candidates/${candidateId}`);
  return { note: { ...(data as { id: string; body: string; created_at: string }), author: session.profile.full_name } };
}
