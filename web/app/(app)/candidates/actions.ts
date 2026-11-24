'use server';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  RESUME_TYPES,
  candidateSchema,
  consentSchema,
  noteSchema,
  resumeFileIssue,
  safeFileName,
  uuidSchema,
  type CandidateInput,
} from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { DuplicateRow } from '@/lib/candidates';
import { extractResumeText } from '@/lib/resume-text';
import { FIELD_LABELS, firstLines, parseResumeText, type ResumeFields } from '@/lib/resume-parse';
import type { FormState } from '@/lib/form-state';

type Supa = Awaited<ReturnType<typeof createClient>>;

export type CandidateFormState = FormState & {
  fieldErrors?: Record<string, string>;
  duplicates?: DuplicateRow[];
};

const CANDIDATE_FIELDS = [
  'full_name', 'phone', 'email', 'city', 'linkedin_url', 'current_position', 'source_id',
  'experience_years', 'desired_salary', 'salary_currency', 'available_from', 'skills', 'summary',
] as const;

function readCandidate(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const key of CANDIDATE_FIELDS) raw[key] = String(formData.get(key) ?? '');
  if (!raw.salary_currency) raw.salary_currency = 'UAH';
  return candidateSchema.safeParse(raw);
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function toRow(c: CandidateInput) {
  return {
    full_name: c.full_name,
    phone: c.phone,
    email: c.email,
    city: c.city,
    linkedin_url: c.linkedin_url,
    current_position: c.current_position,
    source_id: c.source_id,
    total_experience_months: c.experience_years === null ? null : Math.round(c.experience_years * 12),
    desired_salary: c.desired_salary,
    salary_currency: c.salary_currency,
    available_from: c.available_from,
    skills: c.skills,
    summary: c.summary,
  };
}

async function findDuplicates(supabase: Supa, c: CandidateInput, exclude: string | null): Promise<DuplicateRow[]> {
  const { data, error } = await supabase.rpc('describe_duplicates', {
    p_phone: c.phone,
    p_email: c.email,
    p_linkedin: c.linkedin_url,
    p_full_name: c.full_name,
    p_city: c.city,
    p_exclude: exclude,
  });
  if (error) return [];
  return (data ?? []) as DuplicateRow[];
}

// ---------------------------------------------------------------------
// Збереження файлу резюме: запис у БД від імені користувача (діють права),
// сам файл — у приватне сховище службовим ключем. Відкат при помилці.
// ---------------------------------------------------------------------
type Stored = { issue: string | null; fields: ResumeFields };

async function storeResume(supabase: Supa, candidateId: string, file: File): Promise<Stored> {
  const result = await storeResumeInner(supabase, candidateId, file);
  return typeof result === 'string' ? { issue: result, fields: {} } : { issue: null, fields: result };
}

async function storeResumeInner(supabase: Supa, candidateId: string, file: File): Promise<string | ResumeFields> {
  const issue = resumeFileIssue(file.name, file.size);
  if (issue) return issue;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = file.name.split('.').pop()!.toLowerCase();
  const mime = RESUME_TYPES[ext];
  // Текст резюме — для пошуку по базі і автозаповнення картки
  const text = await extractResumeText(bytes, ext);
  const fields = parseResumeText(text ?? '', file.name);
  const path = `candidates/${candidateId}/${randomUUID()}-${safeFileName(file.name)}`;

  // Ідентифікатор задаємо самі і не просимо базу повернути рядок: правило читання файлів
  // перевіряє запис, який у межах цієї ж команди ще не видно, і відхилило б вставку
  const docId = randomUUID();
  const { error } = await supabase
    .from('documents')
    .insert({
      id: docId,
      candidate_id: candidateId,
      storage_path: path,
      original_name: file.name.slice(0, 250),
      mime_type: mime,
      size_bytes: file.size,
      sha256,
      extracted_text: text,
      parse_status: !text ? 'failed' : Object.keys(fields).length ? 'parsed' : 'indexed_only',
    });

  if (error) {
    if (error.code === '23505') {
      // Такий самий файл уже є — підкажемо, у кого (якщо користувач має доступ до тієї картки)
      const admin = createAdminClient();
      const { data: existing } = await admin
        .from('documents')
        .select('candidate_id')
        .eq('sha256', sha256)
        .is('deleted_at', null)
        .maybeSingle();
      if (existing?.candidate_id === candidateId) return 'Цей файл уже завантажено до цієї картки';
      if (existing?.candidate_id) {
        const { data: other } = await supabase.from('candidates').select('full_name').eq('id', existing.candidate_id).maybeSingle();
        return other
          ? `Цей самий файл уже є в картці «${other.full_name}». Можливо, це той самий кандидат`
          : 'Цей самий файл уже є в базі (у картці, до якої у вас немає доступу)';
      }
      return 'Цей самий файл уже є в базі';
    }
    return translateError(error);
  }

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from('resumes').upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    await admin.from('documents').delete().eq('id', docId);
    return `Файл не збережено: ${translateError(uploadError)}`;
  }
  return fields;
}

// Розпізнати дані з резюме до створення картки (файл ще не зберігається)
export async function extractResumeFields(
  formData: FormData,
): Promise<{ fields: ResumeFields; error?: string; preview?: string[] }> {
  const file = formData.get('resume');
  if (!(file instanceof File) || file.size === 0) return { fields: {} };
  const issue = resumeFileIssue(file.name, file.size);
  if (issue) return { fields: {}, error: issue };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { fields: {}, error: 'Сесія завершилася. Увійдіть знову.' };

  const ext = file.name.split('.').pop()!.toLowerCase();
  const text = await extractResumeText(new Uint8Array(await file.arrayBuffer()), ext);
  if (!text) {
    const fromFile = parseResumeText('', file.name);
    if (fromFile.full_name) {
      return { fields: fromFile, error: 'Текст резюме не прочитано (можливо, скан) — ПІБ взято з назви файлу, решту заповніть вручну.' };
    }
    return {
      fields: {},
      error: ['jpg', 'jpeg', 'png'].includes(ext)
        ? 'Це зображення — текст з нього поки не розпізнається. Заповніть поля вручну.'
        : 'Не вдалося прочитати текст (можливо, це скан). Заповніть поля вручну.',
    };
  }
  const fields = parseResumeText(text, file.name);
  // Якщо ПІБ не знайдено — показуємо (лише цьому користувачу) початок тексту, щоб зрозуміти причину
  return fields.full_name ? { fields } : { fields, preview: firstLines(text) };
}

// ---------------------------------------------------------------------
// Картка кандидата
// ---------------------------------------------------------------------
export async function createCandidate(_prev: CandidateFormState, formData: FormData): Promise<CandidateFormState> {
  const parsed = readCandidate(formData);
  if (!parsed.success) return { error: 'Перевірте виділені поля', fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const consent = consentSchema.safeParse({
    legal_basis: formData.get('legal_basis'),
    source: formData.get('consent_source'),
    expires_at: formData.get('consent_expires_at') ?? '',
  });
  if (!consent.success) {
    return { error: 'Перевірте виділені поля', fieldErrors: { consent: consent.error.issues[0]?.message ?? 'Перевірте підставу' } };
  }

  const supabase = await createClient();
  if (formData.get('confirm_duplicates') !== 'yes') {
    const duplicates = await findDuplicates(supabase, parsed.data, null);
    if (duplicates.length) return { duplicates };
  }

  const { data: created, error } = await supabase.from('candidates').insert(toRow(parsed.data)).select('id').single();
  if (error) return { error: translateError(error) };

  const { error: consentError } = await supabase.from('consents').insert({
    candidate_id: created.id,
    legal_basis: consent.data.legal_basis,
    source: consent.data.source,
    expires_at: consent.data.expires_at,
  });

  const notices: string[] = ['created'];
  if (consentError) notices.push('consent_failed');

  const file = formData.get('resume');
  if (file instanceof File && file.size > 0) {
    const { issue: uploadIssue } = await storeResume(supabase, created.id, file);
    if (uploadIssue) {
      revalidatePath('/candidates');
      redirect(`/candidates/${created.id}?notice=${notices.join(',')}&upload_error=${encodeURIComponent(uploadIssue)}`);
    }
  }

  revalidatePath('/candidates');
  redirect(`/candidates/${created.id}?notice=${notices.join(',')}`);
}

export async function updateCandidate(_prev: CandidateFormState, formData: FormData): Promise<CandidateFormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const parsed = readCandidate(formData);
  if (!parsed.success) return { error: 'Перевірте виділені поля', fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  if (formData.get('confirm_duplicates') !== 'yes') {
    const duplicates = (await findDuplicates(supabase, parsed.data, id.data)).filter((d) => d.match_type === 'exact');
    if (duplicates.length) return { duplicates };
  }

  const { data, error } = await supabase.from('candidates').update(toRow(parsed.data)).eq('id', id.data).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права редагувати цього кандидата' };

  revalidatePath('/candidates');
  revalidatePath(`/candidates/${id.data}`);
  redirect(`/candidates/${id.data}?notice=saved`);
}

export async function setCandidateDeleted(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const deleted = formData.get('deleted') === 'true';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('candidates')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };

  revalidatePath('/candidates');
  revalidatePath(`/candidates/${id.data}`);
  return { ok: deleted ? 'Кандидата перенесено в кошик' : 'Кандидата відновлено' };
}

export async function markReviewed(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('candidates').update({ review_status: 'reviewed' }).eq('id', id.data).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  revalidatePath(`/candidates/${id.data}`);
  return { ok: 'Позначено як перевірене' };
}

// ---------------------------------------------------------------------
// Резюме
// ---------------------------------------------------------------------
export async function uploadResume(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const file = formData.get('resume');
  if (!(file instanceof File) || file.size === 0) return { error: 'Оберіть файл резюме' };

  const supabase = await createClient();
  const { issue, fields } = await storeResume(supabase, id.data, file);
  if (issue) return { error: issue };

  // Дані з резюме заповнюють лише порожні поля картки — нічого не перезаписуємо
  const { data: current } = await supabase
    .from('candidates')
    .select('phone, email, city, desired_salary, current_position, linkedin_url')
    .eq('id', id.data)
    .maybeSingle();
  const patch: Record<string, string | number> = {};
  if (current) {
    if (!current.phone && fields.phone) patch.phone = fields.phone;
    if (!current.email && fields.email) patch.email = fields.email;
    if (!current.city && fields.city) patch.city = fields.city;
    if (!current.current_position && fields.current_position) patch.current_position = fields.current_position;
    if (!current.linkedin_url && fields.linkedin_url) patch.linkedin_url = fields.linkedin_url;
    if (current.desired_salary == null && fields.desired_salary) {
      patch.desired_salary = Number(fields.desired_salary);
      patch.salary_currency = fields.salary_currency ?? 'UAH';
    }
  }
  let filled = '';
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('candidates').update(patch).eq('id', id.data);
    if (!error) {
      filled = ` З резюме заповнено: ${Object.keys(patch)
        .filter((k) => k !== 'salary_currency')
        .map((k) => FIELD_LABELS[k as keyof ResumeFields])
        .join(', ')}. Перевірте дані.`;
    }
  }
  revalidatePath(`/candidates/${id.data}`);
  return { ok: `Резюме завантажено.${filled}` };
}

export async function deleteDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  const candidateId = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!id.success || !candidateId.success) return { error: 'Невірний файл' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  revalidatePath(`/candidates/${candidateId.data}`);
  return { ok: 'Файл перенесено в кошик' };
}

// ---------------------------------------------------------------------
// Згоди на обробку персональних даних
// ---------------------------------------------------------------------
export async function addConsent(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const parsed = consentSchema.safeParse({
    legal_basis: formData.get('legal_basis'),
    source: formData.get('consent_source'),
    expires_at: formData.get('consent_expires_at') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте дані' };

  const supabase = await createClient();
  const { error } = await supabase.from('consents').insert({
    candidate_id: id.data,
    legal_basis: parsed.data.legal_basis,
    source: parsed.data.source,
    expires_at: parsed.data.expires_at,
  });
  if (error) return { error: translateError(error) };
  revalidatePath(`/candidates/${id.data}`);
  return { ok: 'Підставу обробки даних додано' };
}

export async function withdrawConsent(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  const candidateId = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!id.success || !candidateId.success) return { error: 'Невірний запис' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('consents')
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('id', id.data)
    .is('withdrawn_at', null)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  revalidatePath(`/candidates/${candidateId.data}`);
  return { ok: 'Згоду відкликано' };
}

// ---------------------------------------------------------------------
// Нотатки
// ---------------------------------------------------------------------
export async function addNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('candidate_id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const parsed = noteSchema.safeParse({ body: formData.get('body') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте текст' };

  const supabase = await createClient();
  const { error } = await supabase.from('notes').insert({ candidate_id: id.data, body: parsed.data.body });
  if (error) return { error: translateError(error) };
  revalidatePath(`/candidates/${id.data}`);
  return { ok: 'Нотатку додано' };
}
