// Аналітичні блоки дашборда: тривалість роботи над вакансіями, воронка, причини відмов, джерела.
// Однаково працює для KAN Talent і HomeHub (дані — з простору ws).
import { createClient } from '@/lib/supabase/server';
import { ChartCard, HBarChart, KpiTile } from '@/components/dashboard-charts';
import { switchHref, type WorkspaceCode } from '@/lib/workspace';

import type { Overview } from '@/components/dashboard-types';
import { FunnelPanel } from '@/components/funnel-panel';

export async function DashboardOverview({ ws, current, compact = false }: { ws: WorkspaceCode; current: WorkspaceCode; compact?: boolean }) {
  const sb = await createClient({ workspace: ws });
  const [{ data, error }, { data: vs }] = await Promise.all([
    sb.rpc('dashboard_overview', { p_vacancy: null }),
    sb.from('vacancies').select('id, title').neq('status', 'draft').order('opened_at', { ascending: false }).limit(300),
  ]);
  if (error || !data) return null;
  const o = data as Overview;
  const href = (path: string) => (ws === current ? path : switchHref(ws, path));

  return (
    <div className="space-y-5">
      {compact ? (
        <ChartCard title="Тривалість роботи над поточними вакансіями" subtitle="Днів від відкриття · колір — юрособа">
          <div className="mb-4 flex items-center gap-4 rounded-2xl bg-soft px-4 py-3">
            <span className="text-3xl font-bold tracking-tight tabular-nums">{o.avg_open_days != null ? `${o.avg_open_days}д` : '—'}</span>
            <span className="text-xs leading-tight text-ink-soft">середня тривалість роботи над поточними вакансіями</span>
          </div>
          <HBarChart items={o.open_vacancies.map((v) => ({ id: v.id, label: v.title, value: v.days, color: v.color, href: href(`/vacancies/${v.id}`) }))} />
        </ChartCard>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <ChartCard title="Тривалість роботи над поточними вакансіями" subtitle="Відкриті вакансії і вакансії на паузі">
            <KpiTile
              label="Середній час роботи над вакансіями"
              value={o.avg_open_days != null ? `${o.avg_open_days}д` : '—'}
              caption="Середня тривалість роботи над поточними вакансіями"
            />
          </ChartCard>
          <ChartCard title="Час роботи над поточними вакансіями" subtitle="Днів від відкриття · колір — юрособа">
            <HBarChart items={o.open_vacancies.map((v) => ({ id: v.id, label: v.title, value: v.days, color: v.color, href: href(`/vacancies/${v.id}`) }))} />
          </ChartCard>
        </div>
      )}

      <FunnelPanel ws={ws} initial={{ funnel: o.funnel, reasons: o.reasons, sources: o.sources }} vacancies={(vs ?? []) as { id: string; title: string }[]} />
    </div>
  );
}
