import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, ExternalLink, Eye, Pencil, X } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { docxToSafeHtml } from '@/lib/resume-text';
import { resumeDisplayName } from '@/lib/resume-parse';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { uuidSchema } from '@/lib/validation';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import {
  CANDIDATE_COLUMNS,
  LEGAL_BASIS_LABELS,
  PARSE_STATUS_LABELS,
  formatBytes,
  formatDate,
  formatExperience,
  formatSalary,
  type CandidateRow,
} from '@/lib/candidates';
import {
  ConsentForm,
  DeleteDocumentButton,
  DeleteRestoreButton,
  MarkReviewedButton,
  NoteForm,
  UploadResumeForm,
  WithdrawConsentButton,
} from './card-actions';

export const metadata: Metadata = { title: 'Картка кандидата' };

type Doc = { id: string; storage_bucket: string; storage_path: string; original_name: string; size_bytes: number | null; parse_status: string; created_at: string; uploaded_by: string | null };
type Consent = { id: string; legal_basis: string; source: string; given_at: string; expires_at: string | null; withdrawn_at: string | null };
type Note = { id: string; body: string; created_at: string; author_id: string };
type Experience = { id: string; company: string | null; position: string | null; start_date: string | null; end_date: string | null; description: string | null };
type Education = { id: string; institution: string | null; degree: string | null; speciality: string | null; year_end: number | null };

const NOTICES: Record<string, string> = {
  created: 'Кандидата створено',
  saved: 'Зміни збережено',
  consent_failed: 'Підставу обробки даних не збережено — додайте її нижче вручну',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function CandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission('candidates.read');
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from('candidates').select(CANDIDATE_COLUMNS).eq('id', id).maybeSingle<CandidateRow>();
  if (!c) notFound();

  const [docs, consents, notes, experience, education, profiles, source] = await Promise.all([
    supabase.from('documents').select('id, storage_bucket, storage_path, original_name, size_bytes, parse_status, created_at, uploaded_by').eq('candidate_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('consents').select('id, legal_basis, source, given_at, expires_at, withdrawn_at').eq('candidate_id', id).order('given_at', { ascending: false }),
    supabase.from('notes').select('id, body, created_at, author_id').eq('candidate_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('candidate_experience').select('id, company, position, start_date, end_date, description').eq('candidate_id', id).order('sort_order'),
    supabase.from('candidate_education').select('id, institution, degree, speciality, year_end').eq('candidate_id', id).order('sort_order'),
    supabase.from('profiles').select('id, full_name'),
    c.source_id ? supabase.from('sources').select('name').eq('id', c.source_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const names = new Map(((profiles.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  const p = session.permissions;
  const deleted = Boolean(c.deleted_at);
  const canUpdate = can(p, 'candidates.update') && !deleted;
  const canUpload = can(p, 'candidates.create') && canUpdate;
  const canDelete = can(p, 'candidates.delete');
  const canRestore = can(p, 'candidates.restore');

  const notice = (Array.isArray(sp.notice) ? sp.notice[0] : sp.notice)?.split(',') ?? [];
  const uploadError = Array.isArray(sp.upload_error) ? sp.upload_error[0] : sp.upload_error;
  const activeConsent = ((consents.data ?? []) as Consent[]).some(
    (x) => !x.withdrawn_at && (!x.expires_at || new Date(x.expires_at) > new Date()),
  );

  const docList = (docs.data ?? []) as Doc[];
  const docName = (d: Doc) => resumeDisplayName(c.full_name, d.original_name, docList.length - docList.indexOf(d));
  const viewId = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const viewing = docList.find((d) => d.id === viewId) ?? null;
  const viewExt = viewing?.original_name.split('.').pop()?.toLowerCase() ?? '';
  let docxHtml: string | null = null;
  if (viewing && viewExt === 'docx') {
    const { data: blob } = await createAdminClient().storage.from(viewing.storage_bucket).download(viewing.storage_path);
    if (blob) {
      docxHtml = await docxToSafeHtml(new Uint8Array(await blob.arrayBuffer()));
      await supabase.rpc('log_event', { p_action: 'view_file', p_entity: 'documents', p_entity_id: viewing.id, p_details: null });
    }
  }

  const preview = viewing && (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <span className="truncate text-sm font-medium" title={docName(viewing)}>
            {docName(viewing)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <a href={`/api/documents/${viewing.id}`} target="_blank" rel="noopener" className="rounded-lg p-2 hover:bg-surface" title="Відкрити в новій вкладці">
              <ExternalLink className="h-4 w-4" aria-label="Відкрити в новій вкладці" />
            </a>
            <a href={`/api/documents/${viewing.id}?download=1`} className="rounded-lg p-2 hover:bg-surface" title="Завантажити">
              <Download className="h-4 w-4" aria-label="Завантажити" />
            </a>
            <Link href={`/candidates/${id}`} scroll={false} className="rounded-lg p-2 hover:bg-surface" title="Закрити перегляд">
              <X className="h-4 w-4" aria-label="Закрити перегляд" />
            </Link>
          </span>
        </div>
        {['pdf', 'txt'].includes(viewExt) ? (
          <iframe src={`/api/documents/${viewing.id}`} title={docName(viewing)} className="h-[80vh] w-full" />
        ) : ['jpg', 'jpeg', 'png'].includes(viewExt) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/documents/${viewing.id}`} alt={docName(viewing)} className="max-h-[80vh] w-full object-contain" />
        ) : viewExt === 'docx' && docxHtml ? (
          <iframe
            sandbox=""
            title={docName(viewing)}
            className="h-[80vh] w-full"
            srcDoc={`<!doctype html><html lang="uk"><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#2b2b2b;padding:24px;max-width:780px;margin:0 auto}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px;vertical-align:top}</style></head><body>${docxHtml}</body></html>`}
          />
        ) : (
          <div className="p-6 text-sm text-ink-soft">
            Для формату .{viewExt} перегляд у браузері недоступний. Завантажте файл кнопкою вгорі.
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <PageHeader
        title={c.full_name}
        description={[c.current_position, c.city].filter(Boolean).join(' · ') || undefined}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Link href="/candidates" className="px-2 py-2 text-sm text-ink-soft underline">
              ← До бази
            </Link>
            {canUpdate && (
              <Link
                href={`/candidates/${id}/edit`}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm hover:bg-surface"
              >
                <Pencil className="h-4 w-4" aria-hidden /> Редагувати
              </Link>
            )}
            {((canDelete && !deleted) || (canRestore && deleted)) && (
              <DeleteRestoreButton id={id} deleted={deleted} name={c.full_name} />
            )}
          </div>
        }
      />

      <div className="mb-4 space-y-2">
        {notice.filter((n) => NOTICES[n]).map((n) => (
          <Alert key={n} kind={n === 'consent_failed' ? 'error' : 'success'}>
            {NOTICES[n]}
          </Alert>
        ))}
        {uploadError && <Alert>Резюме не завантажено: {uploadError.slice(0, 300)}</Alert>}
        {deleted && <Alert>Кандидат у кошику з {formatDate(c.deleted_at, true)}. Дані доступні лише для перегляду.</Alert>}
        {c.review_status === 'unreviewed' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
            <span>Картку створено автоматично з архіву резюме — перевірте дані.</span>
            {canUpdate && <MarkReviewedButton id={id} />}
          </div>
        )}
        {!activeConsent && !deleted && (
          <Alert kind="info">Немає чинної підстави обробки персональних даних. Додайте її в блоці «Персональні дані».</Alert>
        )}
      </div>

      <div className={viewing ? 'grid gap-6 xl:grid-cols-2' : ''}>
      <div className={viewing ? 'grid gap-6' : 'grid gap-6 lg:grid-cols-[3fr_2fr]'}>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-medium">Основне</h2>
            <dl className="divide-y divide-line">
              <Row label="Телефон">{c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="underline">{c.phone}</a> : '—'}</Row>
              <Row label="Email">{c.email ? <a href={`mailto:${c.email}`} className="underline">{c.email}</a> : '—'}</Row>
              <Row label="LinkedIn">
                {c.linkedin_url ? (
                  <a href={c.linkedin_url.startsWith('http') ? c.linkedin_url : `https://${c.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="underline">
                    профіль
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Місто">{c.city ?? '—'}</Row>
              <Row label="Досвід">{formatExperience(c.total_experience_months)}</Row>
              <Row label="Бажана зарплата">{formatSalary(c.desired_salary, c.salary_currency)}</Row>
              <Row label="Готовий вийти">{formatDate(c.available_from)}</Row>
              <Row label="Джерело">{(source.data as { name: string } | null)?.name ?? '—'}</Row>
              <Row label="Відповідальний">{(c.owner_id && names.get(c.owner_id)) || '—'}</Row>
              <Row label="Навички">
                {c.skills.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.skills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Створено">{formatDate(c.created_at, true)}</Row>
              <Row label="Оновлено">{formatDate(c.updated_at, true)}</Row>
            </dl>
            {c.summary && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm">{c.summary}</p>}
          </Card>

          {((experience.data ?? []).length > 0 || (education.data ?? []).length > 0) && (
            <Card>
              {(experience.data ?? []).length > 0 && (
                <>
                  <h2 className="mb-3 font-medium">Досвід роботи</h2>
                  <ul className="mb-4 space-y-3 text-sm">
                    {(experience.data as Experience[]).map((e) => (
                      <li key={e.id}>
                        <div className="font-medium">{[e.position, e.company].filter(Boolean).join(' — ')}</div>
                        <div className="text-xs text-ink-soft">
                          {formatDate(e.start_date)} — {e.end_date ? formatDate(e.end_date) : 'дотепер'}
                        </div>
                        {e.description && <p className="mt-1 whitespace-pre-wrap">{e.description}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {(education.data ?? []).length > 0 && (
                <>
                  <h2 className="mb-3 font-medium">Освіта</h2>
                  <ul className="space-y-2 text-sm">
                    {(education.data as Education[]).map((e) => (
                      <li key={e.id}>
                        {[e.institution, e.speciality, e.degree].filter(Boolean).join(', ')}
                        {e.year_end ? ` (${e.year_end})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-medium">Нотатки</h2>
            {!deleted && <NoteForm candidateId={id} />}
            <ul className="mt-4 space-y-3">
              {((notes.data ?? []) as Note[]).map((n) => (
                <li key={n.id} className="rounded-lg bg-surface p-3 text-sm">
                  <div className="mb-1 text-xs text-ink-soft">
                    {names.get(n.author_id) ?? '—'} · {formatDate(n.created_at, true)}
                  </div>
                  <p className="whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
              {(notes.data ?? []).length === 0 && <li className="text-sm text-ink-soft">Нотаток ще немає</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-medium">Резюме</h2>
            <ul className="mb-4 divide-y divide-line">
              {docList.map((d) => (
                <li key={d.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 text-sm ${viewing?.id === d.id ? 'bg-accent-soft/50' : ''}`}>
                  <div className="min-w-0">
                    <Link href={`/candidates/${id}?view=${d.id}`} scroll={false} className="block truncate font-medium hover:underline" title={`Оригінальна назва: ${d.original_name}`}>
                      {docName(d)}
                    </Link>
                    <div className="text-xs text-ink-soft">
                      {formatBytes(d.size_bytes)} · {formatDate(d.created_at)} · {PARSE_STATUS_LABELS[d.parse_status] ?? d.parse_status}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link href={`/candidates/${id}?view=${d.id}`} scroll={false} className="rounded-lg p-2 hover:bg-surface" title="Переглянути поруч">
                      <Eye className="h-4 w-4" aria-label="Переглянути поруч" />
                    </Link>
                    <a href={`/api/documents/${d.id}?download=1`} className="rounded-lg p-2 hover:bg-surface" title="Завантажити">
                      <Download className="h-4 w-4" aria-label="Завантажити" />
                    </a>
                    {canDelete && !deleted && <DeleteDocumentButton id={d.id} candidateId={id} name={docName(d)} />}
                  </div>
                </li>
              ))}
              {(docs.data ?? []).length === 0 && <li className="py-2 text-sm text-ink-soft">Файлів резюме немає</li>}
            </ul>
            {canUpload && <UploadResumeForm candidateId={id} />}
          </Card>

          <Card>
            <h2 className="mb-1 font-medium">Персональні дані</h2>
            <p className="mb-3 text-xs text-ink-soft">Підстави обробки даних кандидата (ЗУ «Про захист персональних даних», GDPR)</p>
            <ul className="mb-4 space-y-2">
              {((consents.data ?? []) as Consent[]).map((x) => (
                <li key={x.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{LEGAL_BASIS_LABELS[x.legal_basis] ?? x.legal_basis}</span>
                    {x.withdrawn_at ? (
                      <Badge tone="danger">відкликано {formatDate(x.withdrawn_at)}</Badge>
                    ) : x.expires_at && new Date(x.expires_at) <= new Date() ? (
                      <Badge tone="warn">строк минув</Badge>
                    ) : (
                      <Badge tone="ok">чинна</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-ink-soft">
                    {x.source} · з {formatDate(x.given_at)}
                    {x.expires_at ? ` до ${formatDate(x.expires_at)}` : ''}
                  </div>
                  {!x.withdrawn_at && canUpdate && <WithdrawConsentButton id={x.id} candidateId={id} />}
                </li>
              ))}
            </ul>
            {canUpdate && (
              <details>
                <summary className="cursor-pointer text-sm underline">Додати підставу</summary>
                <div className="mt-3">
                  <ConsentForm candidateId={id} />
                </div>
              </details>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 font-medium">Відгуки на вакансії</h2>
            <p className="text-sm text-ink-soft">З'являться на етапі 4 разом із вакансіями та воронкою.</p>
          </Card>
        </div>
      </div>
      {preview}
      </div>
    </>
  );
}
