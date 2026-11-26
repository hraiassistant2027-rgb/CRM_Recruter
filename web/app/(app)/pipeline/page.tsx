import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can, canOn } from '@/lib/permissions';
import { Card, PageHeader, Select } from '@/components/ui';
import { PipelineBoard } from '@/components/pipeline-board';
import { loadBoard } from '../vacancies/load';

export const metadata: Metadata = { title: 'Воронка рекрутингу' };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('applications.read');
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('vacancies')
    .select('id, title, pipeline_id, status, recruiter_id, hiring_manager_id, site_id')
    .in('status', ['open', 'on_hold', 'draft'])
    .order('opened_at', { ascending: false });
  const vacancies = (data ?? []) as { id: string; title: string; pipeline_id: string; status: string; recruiter_id: string | null; hiring_manager_id: string | null; site_id: string | null }[];
  const wanted = Array.isArray(sp.vacancy) ? sp.vacancy[0] : sp.vacancy;
  const current = vacancies.find((v) => v.id === wanted) ?? vacancies[0];
  const board = current ? await loadBoard(supabase, current.id, current.pipeline_id) : null;
  const { data: gAccount } = await supabase.from('email_accounts').select('status').eq('user_id', session.userId).maybeSingle();

  return (
    <>
      <PageHeader title="Воронка рекрутингу" description="Кандидати по етапах відбору для кожної вакансії" />
      {vacancies.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Активних вакансій немає.{' '}
            {can(session.permissions, 'vacancies.manage') && (
              <Link href="/vacancies/new" className="underline">
                Створити вакансію
              </Link>
            )}
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="block min-w-64 flex-1">
                <span className="mb-1.5 block text-sm font-medium">Вакансія</span>
                <Select name="vacancy" defaultValue={current?.id}>
                  {vacancies.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </Select>
              </label>
              <button type="submit" className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-strong">
                Показати
              </button>
              {current && (
                <Link href={`/vacancies/${current.id}`} className="px-2 py-2 text-sm underline">
                  Сторінка вакансії →
                </Link>
              )}
            </form>
          </Card>
          {board && (
            <PipelineBoard
              stages={board.stages}
              cards={board.cards}
              reasons={board.reasons}
              googleReady={gAccount?.status === 'active'}
              sites={board.sites}
              defaultSiteId={current?.site_id ?? null}
              canMove={
                !!current &&
                canOn(session.permissions, 'applications.update', current.recruiter_id === session.userId || current.hiring_manager_id === session.userId)
              }
            />
          )}
        </>
      )}
    </>
  );
}
