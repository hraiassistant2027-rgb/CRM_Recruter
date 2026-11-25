'use server';
import { CUSTOM_MARKER, readCustomValues, type CustomValues } from '@/lib/custom-fields';
import { loadFields } from '@/lib/custom-fields-load';
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
import { insertApplication } from '@/lib/applications';
import type { DuplicateRow } from '@/lib/candidates';
import { extractResumeText } from '@/lib/resume-text';
import { PREVIEW_EXTS, convertForUser } from '@/lib/google-convert';
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

// Власні поля картки (конструктор): перевірка і злиття зі збереженими значеннями
async function readCustom(supabase: Awaited<ReturnType<typeof createClient>>, formData: FormData, existing: CustomValues | null) {
  if (formData.get(CUSTOM_MARKER) !== '1') return { values: null, errors: null };
  const defs = await loadFields(supabase, 'candidates');
  const r = readCustomValues(formData, defs, existing);
  if (!r) return { values: null, errors: null };
  return { values: r.values, errors: Object.keys(r.errors).length ? r.errors : null };
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

async function storeResume(supabase: Supa, candidateId: string, file: File, sourceRef: string | null = null): Promise<Stored> {
  const result = await storeResumeInner(supabase, candidateId, file, sourceRef);
  return typeof result === 'string' ? { issue: result, fields: {} } : { issue: null, fields: result };
}

async function storeResumeInner(supabase: Supa, candidateId: string, file: File, sourceRef: string | null): Promise<string | ResumeFields> {
  const issue = resumeFileIssue(file.name, file.size);
  if (issue) return issue;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = file.name.split('.').pop()!.toLowerCase();
  const mime = RESUME_TYPES[ext];
  const path = `candidates/${candidateId}/${randomUUID()}-${safeFileName(file.name)}`;
  // Текст резюме — для пошуку по базі і автозаповнення картки. Фото, скани і .doc читає Google;
  // для Word/RTF Google ще й робить PDF-копію, щоб резюме показувалося в оригінальному вигляді.
  const local = await extractResumeText(bytes, ext);
  const needText = !local || local.length < 80;
  const needPdf = PREVIEW_EXTS.includes(ext);
  const { data: me } = await supabase.auth.getUser();
  const converted = needText || needPdf ? await convertForUser(me.user?.id, bytes, ext, { text: needText, pdf: needPdf }) : { text: null, pdf: null };
  const text = (local && local.length >= 80 ? local : converted.text ?? local) ?? null;
  const fields = parseResumeText(text ?? '', file.name);
  const previewPath = converted.pdf ? `${path}.preview.pdf` : null;

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
      source_ref: sourceRef,
      preview_path: previewPath,
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
  if (converted.pdf && previewPath) {
    const { error: previewError } = await admin.storage.from('resumes').upload(previewPath, converted.pdf, { contentType: 'application/pdf', upsert: true });
    if (previewError) await admin.from('documents').update({ preview_path: null }).eq('id', docId);
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
  const raw = new Uint8Array(await file.arrayBuffer());
  const local = await extractResumeText(raw, ext);
  const text = local && local.length >= 80 ? local : (await convertForUser(user.user.id, raw, ext, { text: true, pdf: false })).text ?? local;
  if (!text) {
    const fromFile = parseResumeText('', file.name);
    if (fromFile.full_name) {
      return { fields: fromFile, error: 'Текст резюме не прочитано (можливо, скан) — ПІБ взято з назви файлу, решту заповніть вручну.' };
    }
    return {
      fields: {},
      error: ['jpg', 'jpeg', 'png'].includes(ext)
        ? 'Текст на фото не розпізнано. Щоб CRM читала фото і скани, підключіть Google у профілі; інакше заповніть поля вручну.'
        : 'Не вдалося прочитати текст. Якщо це скан — підключіть Google у профілі, щоб CRM його розпізнавала; інакше заповніть поля вручну.',
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
  const custom = await readCustom(supabase, formData, null);
  if (custom.errors) return { error: 'Перевірте виділені поля', fieldErrors: custom.errors };
  if (formData.get('confirm_duplicates') !== 'yes') {
    const duplicates = await findDuplicates(supabase, parsed.data, null);
    if (duplicates.length) return { duplicates };
  }

  const { data: created, error } = await supabase
    .from('candidates')
    .insert({ ...toRow(parsed.data), ...(custom.values ? { custom: custom.values } : {}) })
    .select('id')
    .single();
  if (error) return { error: translateError(error) };

  const { error: consentError } = await supabase.from('consents').insert({
    candidate_id: created.id,
    legal_basis: consent.data.legal_basis,
    source: consent.data.source,
    expires_at: consent.data.expires_at,
  });

  const notices: string[] = ['created'];
  if (consentError) notices.push('consent_failed');

  let uploadIssue: string | null = null;
  const file = formData.get('resume');
  if (file instanceof File && file.size > 0) {
    uploadIssue = (await storeResume(supabase, created.id, file)).issue;
  }

  // Створення зі сторінки вакансії: одразу додаємо кандидата у відбір і повертаємось до воронки
  const vacancyId = uuidSchema.safeParse(formData.get('vacancy_id'));
  if (vacancyId.success) {
    const added = await insertApplication(supabase, vacancyId.data, created.id);
    revalidatePath('/candidates');
    revalidatePath(`/vacancies/${vacancyId.data}`);
    const qs = new URLSearchParams({ notice: added.error ? 'candidate_created' : 'candidate_added', candidate: created.id });
    if (added.error) qs.set('add_error', added.error);
    if (uploadIssue) qs.set('upload_error', uploadIssue);
    redirect(`/vacancies/${vacancyId.data}?${qs.toString()}`);
  }

  revalidatePath('/candidates');
  const qs = new URLSearchParams({ notice: notices.join(',') });
  if (uploadIssue) qs.set('upload_error', uploadIssue);
  redirect(`/candidates/${created.id}?${qs.toString()}`);
}

export async function updateCandidate(_prev: CandidateFormState, formData: FormData): Promise<CandidateFormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірний кандидат' };
  const parsed = readCandidate(formData);
  if (!parsed.success) return { error: 'Перевірте виділені поля', fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data: current } = await supabase.from('candidates').select('custom').eq('id', id.data).maybeSingle();
  const custom = await readCustom(supabase, formData, (current?.custom as CustomValues | null) ?? null);
  if (custom.errors) return { error: 'Перевірте виділені поля', fieldErrors: custom.errors };
  if (formData.get('confirm_duplicates') !== 'yes') {
    const duplicates = (await findDuplicates(supabase, parsed.data, id.data)).filter((d) => d.match_type === 'exact');
    if (duplicates.length) return { duplicates };
  }

  const { data, error } = await supabase
    .from('candidates')
    .update({ ...toRow(parsed.data), ...(custom.values ? { custom: custom.values } : {}) })
    .eq('id', id.data)
    .select('id');
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

// ---------------------------------------------------------------------
// Пакетне завантаження резюме: кожен файл — окремий виклик (клієнт надсилає по черзі).
// Картка створюється автоматично з розпізнаних даних і позначається «не перевірено».
// ---------------------------------------------------------------------
export type ImportResult = {
  status: 'created' | 'existing' | 'duplicate_file' | 'error';
  message: string;
  candidateId?: string;
  name?: string;
  addedToVacancy?: boolean;
};

export async function importResume(formData: FormData): Promise<ImportResult> {
  const file = formData.get('resume');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', message: 'Файл порожній' };
  const issue = resumeFileIssue(file.name, file.size);
  if (issue) return { status: 'error', message: issue };
  const vacancy = uuidSchema.safeParse(formData.get('vacancy_id'));
  const vacancyId = vacancy.success ? vacancy.data : null;
  const source = uuidSchema.safeParse(formData.get('source_id'));
  const sourceRefRaw = String(formData.get('source_ref') ?? '');
  const sourceRef = /^drive:[A-Za-z0-9_-]{10,}$/.test(sourceRefRaw) ? sourceRefRaw : null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: 'error', message: 'Сесія завершилася. Увійдіть знову.' };

  const addToVacancy = async (candidateId: string) => {
    if (!vacancyId) return { added: false, note: '' };
    const r = await insertApplication(supabase, vacancyId, candidateId);
    return r.error ? { added: false, note: ` У вакансію не додано: ${r.error}` } : { added: true, note: ' Додано у вакансію.' };
  };

  // 1. Той самий файл уже є в базі
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const admin = createAdminClient();
  const { data: sameFile } = await admin.from('documents').select('candidate_id').eq('sha256', sha256).is('deleted_at', null).maybeSingle();
  if (sameFile?.candidate_id) {
    const { data: owner } = await supabase.from('candidates').select('id, full_name').eq('id', sameFile.candidate_id).maybeSingle();
    if (!owner) return { status: 'duplicate_file', message: 'Цей файл уже є в базі (у картці, до якої у вас немає доступу)' };
    const v = await addToVacancy(owner.id);
    return { status: 'duplicate_file', message: `Цей файл уже є в картці.${v.note}`, candidateId: owner.id, name: owner.full_name, addedToVacancy: v.added };
  }

  // 2. Розпізнавання
  const ext = file.name.split('.').pop()!.toLowerCase();
  const localText = await extractResumeText(bytes, ext);
  const text = localText && localText.length >= 80 ? localText : (await convertForUser(auth.user.id, bytes, ext, { text: true, pdf: false })).text ?? localText;
  const fields = parseResumeText(text ?? '', file.name);
  const raw: Record<string, string> = {
    full_name: fields.full_name ?? `Без імені (${file.name.slice(0, 80)})`,
    phone: fields.phone ?? '',
    email: fields.email ?? '',
    city: fields.city ?? '',
    linkedin_url: fields.linkedin_url ?? '',
    current_position: fields.current_position ?? '',
    source_id: source.success ? source.data : '',
    experience_years: '',
    desired_salary: fields.desired_salary ?? '',
    salary_currency: fields.salary_currency ?? 'UAH',
    available_from: '',
    skills: '',
    summary: '',
  };
  const parsed = candidateSchema.safeParse(raw);
  // Якщо якесь розпізнане поле не пройшло перевірку — прибираємо його, а не зупиняємось
  let input: CandidateInput;
  if (parsed.success) input = parsed.data;
  else {
    for (const i of parsed.error.issues) if (i.path[0] && i.path[0] !== 'full_name') raw[String(i.path[0])] = '';
    const retry = candidateSchema.safeParse(raw);
    if (!retry.success) return { status: 'error', message: retry.error.issues[0]?.message ?? 'Не вдалося розпізнати дані' };
    input = retry.data;
  }

  // 3. Точний дублікат за телефоном, email або LinkedIn — додаємо резюме до наявної картки
  const exact = (await findDuplicates(supabase, input, null)).find((d) => d.match_type === 'exact' && d.accessible);
  if (exact) {
    const stored = await storeResume(supabase, exact.candidate_id, file, sourceRef);
    const v = await addToVacancy(exact.candidate_id);
    return {
      status: 'existing',
      message: `Кандидат уже є в базі (збіг: ${exact.matched_on === 'phone' ? 'телефон' : exact.matched_on === 'email' ? 'email' : 'LinkedIn'}).${stored.issue ? ` Резюме не додано: ${stored.issue}` : ' Резюме додано до картки.'}${v.note}`,
      candidateId: exact.candidate_id,
      name: exact.full_name ?? undefined,
      addedToVacancy: v.added,
    };
  }

  // 4. Нова картка
  const candidateId = randomUUID();
  const { error } = await supabase.from('candidates').insert({ id: candidateId, ...toRow(input), review_status: 'unreviewed' });
  if (error) return { status: 'error', message: translateError(error) };
  await supabase.from('consents').insert({
    candidate_id: candidateId,
    legal_basis: 'pre_contract',
    source: 'Резюме надіслано кандидатом (пакетне завантаження)',
  });
  const stored = await storeResume(supabase, candidateId, file, sourceRef);
  const v = await addToVacancy(candidateId);
  revalidatePath('/candidates');
  if (vacancyId) revalidatePath(`/vacancies/${vacancyId}`);

  const missing = [!fields.full_name && 'ПІБ', !fields.phone && 'телефон', !fields.email && 'email'].filter(Boolean);
  return {
    status: 'created',
    message: `Створено.${missing.length ? ` Не розпізнано: ${missing.join(', ')}.` : ''}${stored.issue ? ` Резюме не збережено: ${stored.issue}` : ''}${v.note}`,
    candidateId,
    name: input.full_name,
    addedToVacancy: v.added,
  };
}
