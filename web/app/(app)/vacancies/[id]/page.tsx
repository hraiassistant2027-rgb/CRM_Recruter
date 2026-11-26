import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Files, Pencil, Upload } from 'lucide-react';
import { BulkResumeUpload } from '@/components/bulk-resume-upload';
import { CandidateForm } from '../../candidates/candidate-form';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can, canOn } from '@/lib/permissions';
import { uuidSchema } from '@/lib/validation';
import { formatDate } from '@/lib/candidates';
import { PRIORITY_LABELS, VACANCY_COLUMNS, VACANCY_STATUS_LABELS, VACANCY_STATUS_TONE, salaryRange, type VacancyRow } from '@/lib/vacancies';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { CustomFieldValues } from '@/components/custom-field-inputs';
import { loadFields } from '@/lib/custom-fields-load';
import { PipelineBoard } from '@/components/pipeline-board';
import { AddCandidate } from './add-candidate';
import { loadBoard } from '../load';

export const metadata: Metadata = { title: 'Вакансія' };

const NOTICES: Record<string, string> = {
  created: 'Вакансію створено',
  saved: 'Зміни збережено',
  candidate_added: 'Кандидата створено і додано у вакансію',
  candidate_created: 'Кандидата створено',
};

export default async function VacancyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission('vacancies.read');
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: v } = await supabase.from('vacancies').select(VACANCY_COLUMNS).eq('id', id).maybeSingle<VacancyRow>();
  if (!v) notFound();

  const [board, { data: site }, { data: department }, { data: users }, customFields] = await Promise.all([
    can(session.permissions, 'applications.read') ? loadBoard(supabase, v.id, v.pipeline_id) : Promise.resolve(null),
    v.site_id ? supabase.from('sites').select('name, address').eq('id', v.site_id).maybeSingle() : Promise.resolve({ data: null }),
    v.department_id ? supabase.from('departments').select('name').eq('id', v.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id, full_name'),
    loadFields(supabase, 'vacancies'),
  ]);
  const { data: gAccount } = await supabase.from('email_accounts').select('status').eq('user_id', session.userId).maybeSingle();
  const googleReady = gAccount?.status === 'active';
  const userName = new Map(((users ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));
  const p = session.permissions;
  // Права «свої/усі» остаточно перевіряє база; тут — лише що показувати
  const mine = v.recruiter_id === session.userId || v.hiring_manager_id === session.userId;
  const canEdit = canOn(p, 'vacancies.manage', mine);
  const canMove = canOn(p, 'applications.update', mine);
  const canAdd = canOn(p, 'applications.create', mine) && ['open', 'on_hold', 'draft'].includes(v.status);
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const notice = one('notice');
  const noticeCandidate = one('candidate');
  const addError = one('add_error');
  const uploadError = one('upload_error');
  const showNewForm = one('new') === '1' && canAdd && can(p, 'candidates.create');
  const showBulk = one('bulk') === '1' && canAdd && can(p, 'candidates.create');
  const { data: sources } = showNewForm || showBulk
    ? await supabase.from('sources').select('id, name').eq('is_active', true).order('sort_order')
    : { data: [] };
  const manager = (v.hiring_manager_id && userName.get(v.hiring_manager_id)) || v.hiring_manager_name;

  return (
    <>
      <PageHeader
        title={v.title}
        description={[(site as { name: string } | null)?.name, (department as { name: string } | null)?.name].filter(Boolean).join(' · ') || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/vacancies" className="px-2 py-2 text-sm text-ink-soft underline">
              ← До вакансій
            </Link>
            {canEdit && (
              <Link href={`/vacancies/${id}/edit`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-2.5 text-sm hover:bg-surface">
                <Pencil className="h-4 w-4" aria-hidden /> Редагувати
              </Link>
            )}
          </div>
        }
      />
      {(notice && NOTICES[notice]) || addError || uploadError ? (
        <div className="mb-4 space-y-2">
          {notice && NOTICES[notice] && (
            <Alert kind="success">
              {NOTICES[notice]}
              {noticeCandidate && uuidSchema.safeParse(noticeCandidate).success && (
                <>
                  {' '}
                  —{' '}
                  <Link href={`/candidates/${noticeCandidate}`} className="underline">
                    відкрити картку
                  </Link>
                </>
              )}
            </Alert>
          )}
          {addError && <Alert>У вакансію не додано: {addError.slice(0, 300)}</Alert>}
          {uploadError && <Alert>Резюме не збережено: {uploadError.slice(0, 300)}</Alert>}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone={VACANCY_STATUS_TONE[v.status]}>{VACANCY_STATUS_LABELS[v.status]}</Badge>
            <Badge tone={v.priority === 'urgent' ? 'danger' : v.priority === 'high' ? 'warn' : 'neutral'}>Пріоритет: {PRIORITY_LABELS[v.priority]}</Badge>
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-soft">Рекрутер</dt><dd>{(v.recruiter_id && userName.get(v.recruiter_id)) || '—'}</dd></div>
            <div><dt className="text-ink-soft">Керівник-замовник</dt><dd>{manager || '—'}</dd></div>
            <div><dt className="text-ink-soft">Кількість місць</dt><dd>{v.headcount}</dd></div>
            <div><dt className="text-ink-soft">Зарплата</dt><dd>{salaryRange(v.salary_min, v.salary_max, v.salary_currency)}</dd></div>
            <div><dt className="text-ink-soft">Відкрита</dt><dd>{formatDate(v.opened_at)}</dd></div>
            <div><dt className="text-ink-soft">Закрита</dt><dd>{formatDate(v.closed_at)}</dd></div>
            {(site as { address: string | null } | null)?.address && (
              <div className="sm:col-span-2"><dt className="text-ink-soft">Адреса об'єкта</dt><dd>{(site as { address: string }).address}</dd></div>
            )}
          </dl>
          {v.requirements && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm">{v.requirements}</p>}
          {customFields.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <CustomFieldValues fields={customFields} values={v.custom} />
            </div>
          )}
        </Card>
        {canAdd && (
          <Card>
            <h2 className="mb-3 text-lg font-bold tracking-tight">Додати кандидата з бази</h2>
            <AddCandidate vacancyId={v.id} canCreateCandidate={can(p, 'candidates.create')} />
            {can(p, 'candidates.create') && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/vacancies/${id}?new=1#new-candidate`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-accent-strong bg-accent-soft/40 px-3 py-3 text-sm font-medium hover:bg-accent-soft"
                >
                  <Upload className="h-4 w-4" aria-hidden /> Одне резюме
                </Link>
                <Link
                  href={`/vacancies/${id}?bulk=1#bulk-upload`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-accent-strong bg-accent-soft/40 px-3 py-3 text-sm font-medium hover:bg-accent-soft"
                >
                  <Files className="h-4 w-4" aria-hidden /> Кілька резюме
                </Link>
              </div>
            )}
          </Card>
        )}
      </div>

      {showBulk && (
        <Card className="mb-6">
          <div id="bulk-upload" className="scroll-mt-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Кілька резюме у вакансію «{v.title}»</h2>
                <p className="text-sm text-ink-soft">Кандидати з'являться у воронці на етапі «Новий кандидат».</p>
              </div>
              <Link href={`/vacancies/${id}`} className="text-sm text-ink-soft underline">
                Закрити
              </Link>
            </div>
            <BulkResumeUpload vacancyId={v.id} sources={(sources ?? []) as { id: string; name: string }[]} />
          </div>
        </Card>
      )}

      {showNewForm && (
        <Card className="mb-6">
          <div id="new-candidate" className="scroll-mt-4">
            <h2 className="text-lg font-bold tracking-tight">Новий кандидат у вакансію «{v.title}»</h2>
            <p className="mb-4 text-sm text-ink-soft">Оберіть файл резюме — дані заповняться автоматично. Після збереження кандидат з'явиться на етапі «Новий кандидат».</p>
            <CandidateForm sources={(sources ?? []) as { id: string; name: string }[]} vacancyId={v.id} cancelHref={`/vacancies/${id}`} />
          </div>
        </Card>
      )}

      {board && (
        <>
          <h2 className="mb-3 text-lg font-bold tracking-tight">Воронка</h2>
          <PipelineBoard stages={board.stages} cards={board.cards} reasons={board.reasons} canMove={canMove} googleReady={googleReady} sites={board.sites} defaultSiteId={v.site_id} />
        </>
      )}
    </>
  );
}
