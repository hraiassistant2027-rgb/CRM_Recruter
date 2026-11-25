import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { translateError } from '@/lib/errors';
import { Alert, Card, PageHeader, Select } from '@/components/ui';
import { EntityColorPicker } from '@/components/entity-color-picker';
import { DynamicsChart, FunnelBars } from '@/components/analytics-charts';
import { CLASS_INFO } from '@/lib/vacancies';
import { formatDate } from '@/lib/candidates';
import { PRESETS, pct, readAnalyticsFilters, rpcArgs, type Analytics } from '@/lib/analytics';
import { ReportTabs } from '../tabs';

export const metadata: Metadata = { title: 'Аналітика' };

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
    </Card>
  );
}

const th = 'px-3 py-2.5 font-medium';
const td = 'px-3 py-2.5 tabular-nums';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('reports.read');
  const f = readAnalyticsFilters(await searchParams);
  const supabase = await createClient();
  const [{ data, error }, { data: entities }, { data: projects }, { data: users }] = await Promise.all([
    supabase.rpc('analytics_report', rpcArgs(f)),
    supabase.from('legal_entities').select('id, color, is_active').order('sort_order').order('name'),
    supabase.from('projects').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ]);
  const a = data as Analytics | null;
  const entityList = ((entities ?? []) as { id: string; color: string; is_active: boolean }[]).filter((e) => e.is_active || e.id === f.entity);
  const qs = new URLSearchParams(
    Object.entries({ ...f, preset: f.preset === 'custom' ? '' : f.preset, from: f.preset === 'custom' ? f.from : '', to: f.preset === 'custom' ? f.to : '' }).filter(
      ([, v]) => v !== '',
    ) as [string, string][],
  ).toString();
  const presetLink = (p: string) => {
    const q = new URLSearchParams(qs);
    q.set('preset', p);
    q.delete('from');
    q.delete('to');
    return `/reports/analytics?${q.toString()}`;
  };

  return (
    <>
      <ReportTabs active="analytics" />
      <PageHeader title="Аналітика рекрутингу" description={`Період: ${formatDate(f.from)} — ${formatDate(f.to)}`} />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(PRESETS).map(([key, p]) => (
            <Link
              key={key}
              href={presetLink(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${f.preset === key ? 'border-ink bg-accent font-medium' : 'border-line bg-white hover:bg-surface'}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">З</span>
            <input type="date" name="from" defaultValue={f.from} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">по</span>
            <input type="date" name="to" defaultValue={f.to} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Рекрутер</span>
            <Select name="recruiter" defaultValue={f.recruiter}>
              <option value="">Усі</option>
              {((users ?? []) as { id: string; full_name: string }[]).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Проект</span>
            <Select name="project" defaultValue={f.project}>
              <option value="">Усі</option>
              {((projects ?? []) as { id: string; name: string }[]).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Клас</span>
            <Select name="cls" defaultValue={f.cls}>
              <option value="">Усі</option>
              {Object.entries(CLASS_INFO).map(([k, info]) => (
                <option key={k} value={k}>{k} — {info.label}</option>
              ))}
            </Select>
          </label>
          <div className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Юр. особа</span>
            <EntityColorPicker name="entity" entities={entityList} defaultValue={f.entity} emptyLabel="Усі" />
          </div>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">Показати</button>
          <Link href="/reports/analytics" className="pb-2 text-sm text-ink-soft underline">Скинути</Link>
        </form>
      </Card>

      {error || !a ? (
        <Alert>{error ? translateError(error) : 'Не вдалося побудувати аналітику'}</Alert>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Нових кандидатів" value={a.kpi.new_candidates} />
            <Kpi label="Нових відгуків" value={a.kpi.applications} />
            <Kpi label="Співбесід проведено" value={a.kpi.interviews} />
            <Kpi label="Оферів" value={a.kpi.offers} />
            <Kpi label="Найнято" value={a.kpi.hires} tone="text-ok" hint={a.kpi.avg_days_to_hire != null ? `у середньому за ${a.kpi.avg_days_to_hire} дн.` : undefined} />
            <Kpi label="Вакансій відкрито" value={a.kpi.vacancies_opened} />
            <Kpi label="Вакансій закрито" value={a.kpi.vacancies_closed} hint={a.kpi.avg_close_days != null ? `середній строк ${a.kpi.avg_close_days} дн.` : undefined} />
            <Kpi label="Зараз у роботі" value={a.kpi.open_now} hint={a.kpi.overdue_now ? `прострочено: ${a.kpi.overdue_now}` : 'без прострочених'} tone={a.kpi.overdue_now ? 'text-danger' : undefined} />
          </div>

          <Card className="mb-4">
            <h2 className="font-medium">Динаміка</h2>
            <p className="mb-3 text-xs text-ink-soft">{a.bucket === 'month' ? 'По місяцях' : 'По тижнях'}. Наведіть на стовпчики, щоб побачити цифри.</p>
            <DynamicsChart data={a.dynamics} bucket={a.bucket} />
          </Card>

          <div className="mb-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
            <Card>
              <h2 className="font-medium">Конверсія воронки</h2>
              <p className="mb-3 text-xs text-ink-soft">
                Скільки кандидатів, доданих у вакансії за період, дійшли до кожного етапу. Відсоток — перехід з попереднього етапу.
              </p>
              <FunnelBars data={a.funnel} />
            </Card>
            <Card>
              <h2 className="font-medium">Причини відмов</h2>
              <p className="mb-3 text-xs text-ink-soft">Серед кандидатів, доданих за період</p>
              {a.rejections.length === 0 ? (
                <p className="text-sm text-ink-soft">Відмов немає.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {a.rejections.map((r) => (
                    <li key={`${r.side}-${r.name}`} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate">{r.name}</span>
                        <span className="text-xs text-ink-soft">{r.side === 'candidate' ? 'відмовився кандидат' : 'відмовила компанія'}</span>
                      </span>
                      <b className="tabular-nums">{r.count}</b>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Ефективність рекрутерів</h2>
                <p className="text-xs text-ink-soft">За вакансіями, де людина вказана рекрутером</p>
              </div>
              <a href={`/api/reports/analytics?kind=recruiters&${qs}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:bg-surface">
                <Download className="h-4 w-4" aria-hidden /> Excel
              </a>
            </div>
            {a.recruiters.length === 0 ? (
              <p className="text-sm text-ink-soft">Немає вакансій з рекрутерами за цими умовами.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    <tr>
                      <th className={th}>Рекрутер</th>
                      <th className={th}>Додав кандидатів</th>
                      <th className={th}>Співбесід</th>
                      <th className={th}>Найнято</th>
                      <th className={th}>Закрито вакансій</th>
                      <th className={th}>Сер. строк закриття</th>
                      <th className={th}>Зараз у роботі</th>
                      <th className={th}>Прострочено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.recruiters.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 font-medium">{r.name}</td>
                        <td className={td}>{r.candidates}</td>
                        <td className={td}>{r.interviews}</td>
                        <td className={`${td} font-semibold text-ok`}>{r.hires}</td>
                        <td className={td}>{r.closed}</td>
                        <td className={td}>{r.avg_close_days != null ? `${r.avg_close_days} дн.` : '—'}</td>
                        <td className={td}>{r.open_now}</td>
                        <td className={`${td} ${r.overdue ? 'font-semibold text-danger' : ''}`}>{r.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">Ефективність джерел</h2>
                <p className="text-xs text-ink-soft">Скільки кандидатів прийшло і скільки з них дійшли до керівника, оферу та найму</p>
              </div>
              <a href={`/api/reports/analytics?kind=sources&${qs}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:bg-surface">
                <Download className="h-4 w-4" aria-hidden /> Excel
              </a>
            </div>
            {a.sources.length === 0 ? (
              <p className="text-sm text-ink-soft">За цей період нових кандидатів немає.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
                    <tr>
                      <th className={th}>Джерело</th>
                      <th className={th}>Нових кандидатів</th>
                      <th className={th}>Відгуків у вакансіях</th>
                      <th className={th}>До керівника</th>
                      <th className={th}>Офер</th>
                      <th className={th}>Найнято</th>
                      <th className={th}>Конверсія в найм</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.sources.map((s) => (
                      <tr key={s.name}>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                            {s.name}
                          </span>
                        </td>
                        <td className={td}>{s.candidates}</td>
                        <td className={td}>{s.applications}</td>
                        <td className={td}>
                          {s.manager} <span className="text-xs text-ink-soft">{pct(s.manager, s.applications)}</span>
                        </td>
                        <td className={td}>
                          {s.offers} <span className="text-xs text-ink-soft">{pct(s.offers, s.applications)}</span>
                        </td>
                        <td className={`${td} font-semibold text-ok`}>{s.hires}</td>
                        <td className={td}>{pct(s.hires, s.applications)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
