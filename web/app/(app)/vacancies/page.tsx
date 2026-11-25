import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Badge, Card, PageHeader, Select } from '@/components/ui';
import { formatDate } from '@/lib/candidates';
import {
  PRIORITY_LABELS,
  VACANCY_COLUMNS,
  VACANCY_STATUS_LABELS,
  VACANCY_STATUS_TONE,
  salaryRange,
  type VacancyRow,
} from '@/lib/vacancies';

export const metadata: Metadata = { title: 'Вакансії' };

export default async function VacanciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('vacancies.read');
  const sp = await searchParams;
  const statusParam = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = statusParam && (statusParam === 'all' || statusParam in VACANCY_STATUS_LABELS) ? statusParam : 'active';
  const mine = (Array.isArray(sp.mine) ? sp.mine[0] : sp.mine) === '1';

  const supabase = await createClient();
  let query = supabase.from('vacancies').select(VACANCY_COLUMNS).order('opened_at', { ascending: false }).limit(500);
  if (status === 'active') query = query.in('status', ['open', 'on_hold', 'draft']);
  else if (status !== 'all') query = query.eq('status', status);
  if (mine) query = query.eq('recruiter_id', session.userId);

  const [{ data }, { data: counts }, { data: stages }, { data: sites }, { data: users }, { data: entities }] = await Promise.all([
    query,
    supabase.rpc('vacancy_stage_counts'),
    supabase.from('pipeline_stages').select('id, kind'),
    supabase.from('sites').select('id, name'),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('legal_entities').select('id, color'),
  ]);
  const entityColor = new Map(((entities ?? []) as { id: string; color: string }[]).map((e) => [e.id, e.color]));
  const vacancies = (data ?? []) as VacancyRow[];
  const kindOf = new Map(((stages ?? []) as { id: string; kind: string }[]).map((s) => [s.id, s.kind]));
  const siteName = new Map(((sites ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const userName = new Map(((users ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));
  const stats = new Map<string, { active: number; hired: number }>();
  for (const row of (counts ?? []) as { vacancy_id: string; stage_id: string; cnt: number }[]) {
    const s = stats.get(row.vacancy_id) ?? { active: 0, hired: 0 };
    const kind = kindOf.get(row.stage_id);
    if (kind === 'hired') s.hired += Number(row.cnt);
    else if (kind === 'open' || kind === 'offer') s.active += Number(row.cnt);
    stats.set(row.vacancy_id, s);
  }

  return (
    <>
      <PageHeader
        title="Вакансії"
        actions={
          can(session.permissions, 'vacancies.manage') ? (
            <Link href="/vacancies/new" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">
              <Plus className="h-4 w-4" aria-hidden /> Нова вакансія
            </Link>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Статус</span>
            <Select name="status" defaultValue={status}>
              <option value="active">Активні (відкриті, на паузі, чернетки)</option>
              {Object.entries(VACANCY_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              <option value="all">Усі</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="accent-[var(--color-accent-strong)]" />
            Лише мої
          </label>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">
            Показати
          </button>
        </form>
      </Card>

      {vacancies.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Вакансій не знайдено.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Вакансія</th>
                <th className="px-4 py-3 font-medium">Об'єкт</th>
                <th className="px-4 py-3 font-medium">Рекрутер</th>
                <th className="px-4 py-3 font-medium">Зарплата</th>
                <th className="px-4 py-3 font-medium">У відборі</th>
                <th className="px-4 py-3 font-medium">Найнято</th>
                <th className="px-4 py-3 font-medium">Відкрита</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {vacancies.map((v) => {
                const s = stats.get(v.id) ?? { active: 0, hired: 0 };
                return (
                  <tr key={v.id} className="hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: (v.legal_entity_id && entityColor.get(v.legal_entity_id)) || '#D1D5DB' }}
                          aria-hidden
                        />
                        <Link href={`/vacancies/${v.id}`} className="font-medium hover:underline">
                          {v.title}
                        </Link>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 pl-[18px]">
                        <Badge tone={VACANCY_STATUS_TONE[v.status]}>{VACANCY_STATUS_LABELS[v.status]}</Badge>
                        {(v.priority === 'high' || v.priority === 'urgent') && (
                          <Badge tone={v.priority === 'urgent' ? 'danger' : 'warn'}>{PRIORITY_LABELS[v.priority]}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{(v.site_id && siteName.get(v.site_id)) || '—'}</td>
                    <td className="px-4 py-3">{(v.recruiter_id && userName.get(v.recruiter_id)) || '—'}</td>
                    <td className="px-4 py-3 text-xs">{salaryRange(v.salary_min, v.salary_max, v.salary_currency)}</td>
                    <td className="px-4 py-3">{s.active}</td>
                    <td className="px-4 py-3">
                      {s.hired} / {v.headcount}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">{formatDate(v.opened_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
