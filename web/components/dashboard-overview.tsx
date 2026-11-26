// Аналітичні блоки дашборда: тривалість роботи над вакансіями, воронка, причини відмов, джерела.
// Однаково працює для KAN Talent і HomeHub (дані — з простору ws).
import { createClient } from '@/lib/supabase/server';
import { CATEGORICAL, ChartCard, FunnelChart, HBarChart, KpiTile, PieChart, type FunnelRow, type Slice } from '@/components/dashboard-charts';
import { switchHref, type WorkspaceCode } from '@/lib/workspace';

type Overview = {
  funnel: FunnelRow[];
  reasons: { name: string; side: 'company' | 'candidate'; count: number }[];
  sources: Slice[];
  open_vacancies: { id: string; title: string; days: number; color: string }[];
  avg_open_days: number | null;
};

export async function DashboardOverview({
  ws,
  current,
  vacancy,
  filterHiddenFields = {},
  showFilter = true,
}: {
  ws: WorkspaceCode;
  current: WorkspaceCode;
  vacancy: string | null;
  filterHiddenFields?: Record<string, string>;
  showFilter?: boolean;
}) {
  const sb = await createClient({ workspace: ws });
  const [{ data, error }, { data: vs }] = await Promise.all([
    sb.rpc('dashboard_overview', { p_vacancy: vacancy }),
    showFilter
      ? sb.from('vacancies').select('id, title').neq('status', 'draft').order('opened_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
  ]);
  if (error || !data) return null;
  const o = data as Overview;
  const href = (path: string) => (ws === current ? path : switchHref(ws, path));
  const vacancyTitle = vacancy ? ((vs ?? []) as { id: string; title: string }[]).find((v) => v.id === vacancy)?.title : null;
  const scope = vacancyTitle ? `Вакансія «${vacancyTitle}» · за весь період` : 'За весь період';

  return (
    <div className="space-y-5">
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

      {showFilter && (
        <form method="get" className="flex flex-wrap items-center justify-end gap-2">
          {Object.entries(filterHiddenFields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label htmlFor={`dash-vacancy-${ws}`} className="text-sm text-ink-soft">Воронка, відмови і джерела для</label>
          <select id={`dash-vacancy-${ws}`} name="vacancy" defaultValue={vacancy ?? ''} className="max-w-64 rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
            <option value="">усіх вакансій</option>
            {((vs ?? []) as { id: string; title: string }[]).map((v) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong">Показати</button>
        </form>
      )}

      <ChartCard title="Воронка рекрутингу" subtitle={scope}>
          <FunnelChart rows={o.funnel} />
          <p className="mt-4 flex flex-wrap gap-4 text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8cc97a]" aria-hidden />пройшли етап або ще на ньому</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#f08080]" aria-hidden />вибули на етапі</span>
            <span>Наведіть на рядок — розбивка відмов і час на етапі</span>
          </p>
        </ChartCard>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={vacancyTitle ? 'Причини відмов по вакансії' : 'Причини відмов'} subtitle={scope}>
          <PieChart
            label="Причини відмов"
            empty="Відмов ще немає."
            items={o.reasons.map((r, i) => ({
              name: r.side === 'candidate' ? `${r.name} (кандидат)` : r.name,
              count: r.count,
              color: CATEGORICAL[i % CATEGORICAL.length],
            }))}
          />
        </ChartCard>
        <ChartCard title={vacancyTitle ? 'Джерела щодо вакансії' : 'Джерела кандидатів'} subtitle={scope}>
          <PieChart label="Джерела кандидатів" empty="Кандидатів у вакансіях ще немає." items={o.sources} />
        </ChartCard>
      </div>
    </div>
  );
}
