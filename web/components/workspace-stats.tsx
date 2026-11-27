// Блок показників простору на дашборді: кандидати за джерелами, відкриті вакансії за юрособами, активні відгуки.
// Використовується для поточного простору і (у KAN) для дашборду HomeHub під основним.
import { createClient } from '@/lib/supabase/server';
import { can, type Permissions } from '@/lib/permissions';
import { switchHref, type WorkspaceCode } from '@/lib/workspace';
import { NavLink } from '@/components/nav-link';

type Supa = Awaited<ReturnType<typeof createClient>>;

async function countOf(sb: Supa, table: string, filter?: (q: any) => any): Promise<number | null> {
  let query = sb.from(table).select('id', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

export async function WorkspaceStats({
  ws,
  current,
  permissions,
  title = 'Рекрутинг сьогодні',
  compact = false,
}: {
  ws: WorkspaceCode;
  current: WorkspaceCode;
  permissions: Permissions;
  title?: string;
  compact?: boolean;
}) {
  const sb = await createClient({ workspace: ws });
  const p = permissions;
  const [candidates, openVacancies, activeApplications] = await Promise.all([
    can(p, 'candidates.read') ? countOf(sb, 'candidates', (q) => q.is('deleted_at', null)) : Promise.resolve(null),
    can(p, 'vacancies.read') ? countOf(sb, 'vacancies', (q) => q.eq('status', 'open')) : Promise.resolve(null),
    can(p, 'applications.read') ? countOf(sb, 'applications', (q) => q.is('closed_at', null)) : Promise.resolve(null),
  ]);

  // Кандидати за джерелами
  let sourceStats: { name: string; color: string; count: number }[] = [];
  if (candidates !== null) {
    const [{ data: counts }, { data: sources }] = await Promise.all([
      sb.rpc('candidate_source_counts'),
      sb.from('sources').select('id, name, color, sort_order').order('sort_order'),
    ]);
    const byId = new Map(((counts ?? []) as { source_id: string | null; cnt: number }[]).map((c) => [c.source_id ?? 'none', Number(c.cnt)]));
    sourceStats = ((sources ?? []) as { id: string; name: string; color: string }[])
      .map((s) => ({ name: s.name, color: s.color, count: byId.get(s.id) ?? 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
    const none = byId.get('none') ?? 0;
    if (none) sourceStats.push({ name: 'Без джерела', color: '#D1D5DB', count: none });
  }

  // Відкриті вакансії з кольором юрособи, згруповані по кольорах
  let vacancyList: { id: string; title: string; color: string }[] = [];
  if (openVacancies !== null) {
    const [{ data: vacs }, { data: entities }] = await Promise.all([
      sb.from('vacancies').select('id, title, legal_entity_id').eq('status', 'open').limit(500),
      sb.from('legal_entities').select('id, color, sort_order, name').order('sort_order').order('name'),
    ]);
    const order = new Map(((entities ?? []) as { id: string; color: string }[]).map((e, i) => [e.id, { i, color: e.color }]));
    vacancyList = ((vacs ?? []) as { id: string; title: string; legal_entity_id: string | null }[])
      .map((v) => {
        const e = v.legal_entity_id ? order.get(v.legal_entity_id) : undefined;
        return { id: v.id, title: v.title, color: e?.color ?? '#D1D5DB', rank: e?.i ?? Number.MAX_SAFE_INTEGER };
      })
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, 'uk'))
      .map(({ id, title, color }) => ({ id, title, color }));
  }

  const href = (path: string) => (ws === current ? path : switchHref(ws, path));
  const stats = [
    { label: 'Кандидатів у базі', value: candidates, path: '/candidates' },
    { label: 'Відкритих вакансій', value: openVacancies, path: '/vacancies' },
    { label: 'Активних відгуків у воронці', value: activeApplications, path: '/pipeline' },
  ].filter((s) => s.value !== null);
  if (stats.length === 0) return null;

  const CAPTION: Record<string, string> = {
    '/candidates': 'у базі простору',
    '/vacancies': 'відкрито зараз',
    '/pipeline': 'кандидатів у воронках',
  };
  return (
    <section className="rounded-[28px] bg-panel p-2 shadow-card">
      <h2 className={`text-center font-semibold tracking-tight text-ink-soft ${compact ? 'py-2 text-base' : 'py-3 text-lg'}`}>{title}</h2>
      <div className={`grid gap-2 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {stats.map((s, i) => (
          <NavLink
            key={s.label}
            href={href(s.path)}
            className={`group flex h-[15.5rem] min-w-0 flex-col overflow-hidden rounded-3xl transition-shadow hover:shadow-card ${compact ? 'p-4' : 'p-6'} ${i === 1 ? 'bg-soft' : 'bg-white'}`}
          >
            <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-bold leading-snug text-ink ${compact ? 'text-sm' : 'text-base'}`}>
              {s.label}
              {i === 1 && <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">в роботі</span>}
            </p>
            <p className="mt-2 flex items-end gap-2">
              <span className={`font-bold leading-none tracking-tight tabular-nums ${compact ? 'text-4xl' : 'text-5xl'}`}>{s.value}</span>
              {!compact && <span className="pb-1 text-xs leading-tight text-ink-soft">{CAPTION[s.path]}</span>}
            </p>
            {s.path === '/candidates' && sourceStats.length > 0 && (
              <ul className={`grid min-h-0 flex-1 auto-cols-[minmax(8.5rem,1fr)] grid-flow-col grid-rows-5 content-start gap-x-4 gap-y-1.5 overflow-x-auto ${compact ? 'mt-4 text-xs' : 'mt-5 text-sm'}`}>
                {sourceStats.map((src) => (
                  <li key={src.name} className="flex min-w-0 items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: src.color }} aria-hidden />
                    <span className="flex-1 truncate">{src.name}</span>
                    <span className="font-semibold tabular-nums">{src.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.path === '/vacancies' && vacancyList.length > 0 && (
              <ul className={`grid min-h-0 flex-1 auto-cols-[minmax(8.5rem,1fr)] grid-flow-col grid-rows-5 content-start gap-x-4 gap-y-1.5 overflow-x-auto ${compact ? 'mt-4 text-xs' : 'mt-5 text-sm'}`}>
                {vacancyList.map((v) => (
                  <li key={v.id} className="flex min-w-0 items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: v.color }} aria-hidden />
                    <span className="flex-1 truncate" title={v.title}>{v.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </NavLink>
        ))}
      </div>
    </section>
  );
}
