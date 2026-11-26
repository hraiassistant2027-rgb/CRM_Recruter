import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { translateError } from '@/lib/errors';
import { Alert, Card, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/candidates';
import { PRESETS, readAnalyticsFilters, rpcArgs, type Analytics } from '@/lib/analytics';
import { addDays } from '@/lib/vacancy-report';

export const metadata: Metadata = { title: 'Рекрутери' };

type R = Analytics['recruiters'][number];

// Зміна відносно попереднього такого ж періоду
function Delta({ now, before, inverse = false }: { now: number; before: number | undefined; inverse?: boolean }) {
  if (before === undefined) return null;
  const d = now - before;
  if (d === 0) return <span className="ml-1 text-xs text-ink-soft">=</span>;
  const good = inverse ? d < 0 : d > 0;
  return (
    <span className={`ml-1 text-xs font-medium ${good ? 'text-ok' : 'text-danger'}`} title={`Попередній період: ${before}`}>
      {d > 0 ? '▲' : '▼'}
      {Math.abs(d)}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export default async function RecruitersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('analytics.read');
  const f = readAnalyticsFilters(await searchParams);
  // Попередній період такої ж довжини — для порівняння
  const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000) + 1;
  const prev = { ...f, from: addDays(f.from, -days), to: addDays(f.from, -1), recruiter: '' };
  const supabase = await createClient();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const [cur, before, { data: apps }, { data: upcoming }] = await Promise.all([
    supabase.rpc('analytics_report', rpcArgs({ ...f, recruiter: '' })),
    supabase.rpc('analytics_report', rpcArgs(prev)),
    // Навантаження зараз: активні кандидати у воронках вакансій рекрутера
    supabase.from('applications').select('id, vacancies!inner(recruiter_id)').is('closed_at', null).is('deleted_at', null).limit(10000),
    // Співбесіди на найближчі 7 днів
    supabase
      .from('interviews')
      .select('id, applications!inner(vacancies!inner(recruiter_id))')
      .eq('status', 'scheduled')
      .gte('starts_at', now.toISOString())
      .lt('starts_at', weekAhead.toISOString())
      .limit(5000),
  ]);

  const a = cur.data as Analytics | null;
  const prevBy = new Map(((before.data as Analytics | null)?.recruiters ?? []).map((r) => [r.id, r]));
  type One<T> = T | T[] | null;
  const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const activeBy = new Map<string, number>();
  for (const row of (apps ?? []) as { vacancies: One<{ recruiter_id: string | null }> }[]) {
    const id = first(row.vacancies)?.recruiter_id;
    if (id) activeBy.set(id, (activeBy.get(id) ?? 0) + 1);
  }
  const weekBy = new Map<string, number>();
  for (const row of (upcoming ?? []) as { applications: One<{ vacancies: One<{ recruiter_id: string | null }> }> }[]) {
    const id = first(first(row.applications)?.vacancies ?? null)?.recruiter_id;
    if (id) weekBy.set(id, (weekBy.get(id) ?? 0) + 1);
  }
  const recruiters: R[] = (a?.recruiters ?? []).slice().sort((x, y) => y.hires - x.hires || y.interviews - x.interviews || x.name.localeCompare(y.name, 'uk'));
  const maxActive = Math.max(1, ...recruiters.map((r) => activeBy.get(r.id) ?? 0));
  const presetLink = (p: string) => `/recruiters?preset=${p}`;

  return (
    <>
      <PageHeader
        title="Рекрутери"
        description={`Навантаження зараз і результати за ${formatDate(f.from)} — ${formatDate(f.to)}; стрілки — порівняння з попереднім таким самим періодом`}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          {Object.entries(PRESETS).map(([key, p]) => (
            <Link
              key={key}
              href={presetLink(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${f.preset === key ? 'border-accent-strong bg-accent font-medium text-on-accent' : 'border-line bg-white hover:bg-surface'}`}
            >
              {p.label}
            </Link>
          ))}
          <form method="get" className="ml-auto flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-soft">З</span>
              <input type="date" name="from" defaultValue={f.from} className="rounded-xl border border-field-line bg-field px-3 py-1.5 text-sm focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-soft">по</span>
              <input type="date" name="to" defaultValue={f.to} className="rounded-xl border border-field-line bg-field px-3 py-1.5 text-sm focus:bg-white" />
            </label>
            <button type="submit" className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm hover:bg-surface">Показати</button>
          </form>
        </div>
      </Card>

      {cur.error || !a ? (
        <Alert>{cur.error ? translateError(cur.error) : 'Не вдалося завантажити дані'}</Alert>
      ) : recruiters.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Ще немає вакансій з призначеним рекрутером. Вкажіть рекрутера у вакансії — і він з'явиться тут.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {recruiters.map((r) => {
            const p = prevBy.get(r.id);
            const active = activeBy.get(r.id) ?? 0;
            return (
              <Card key={r.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong" aria-hidden>
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold tracking-tight">{r.name}</h2>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-surface px-2 py-1.5">
                        <div className="text-lg font-semibold tabular-nums">{r.open_now}</div>
                        вакансій у роботі
                      </div>
                      <div className="rounded-lg bg-surface px-2 py-1.5">
                        <div className="text-lg font-semibold tabular-nums">{active}</div>
                        кандидатів у воронці
                      </div>
                      <div className="rounded-lg bg-surface px-2 py-1.5">
                        <div className="text-lg font-semibold tabular-nums">{weekBy.get(r.id) ?? 0}</div>
                        співбесід на 7 днів
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" title="Навантаження відносно найзавантаженішого рекрутера">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (active / maxActive) * 100)}%` }} />
                    </div>
                    {r.overdue > 0 && (
                      <p className="mt-2 text-xs font-medium text-danger">Прострочено вакансій: {r.overdue}</p>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-ink-soft">Додав кандидатів</dt>
                    <dd className="font-semibold tabular-nums">{r.candidates}<Delta now={r.candidates} before={p?.candidates ?? 0} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-soft">Співбесід</dt>
                    <dd className="font-semibold tabular-nums">{r.interviews}<Delta now={r.interviews} before={p?.interviews ?? 0} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-soft">Найнято</dt>
                    <dd className="font-semibold tabular-nums text-ok">{r.hires}<Delta now={r.hires} before={p?.hires ?? 0} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-soft">Закрито вакансій</dt>
                    <dd className="font-semibold tabular-nums">
                      {r.closed}
                      <Delta now={r.closed} before={p?.closed ?? 0} />
                      {r.avg_close_days != null && <span className="ml-1 text-xs font-normal text-ink-soft">за {r.avg_close_days} дн.</span>}
                    </dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-ink-soft">
        Детальніше — у <Link href="/reports/analytics" className="underline">Звіти та аналітика → Аналітика</Link> (конверсія, джерела, вивантаження в Excel).
      </p>
    </>
  );
}
