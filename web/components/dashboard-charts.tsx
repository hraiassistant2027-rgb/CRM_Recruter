// Графіки дашборда в стилі сучасних HR-панелей: смуги з осями і сіткою, воронка з відмовами,
// кругові діаграми з виносками. SVG/HTML без сторонніх бібліотек, рендеряться на сервері.
// Числа завжди підписані текстом; колір допомагає, але не несе значення сам.

export type FunnelRow = { name: string; reached: number; rejected_company: number; rejected_candidate: number; avg_hours: number | null };
export type Slice = { name: string; count: number; color: string };

// Палітра діаграм — у фіксованому порядку (як у зразку: малиновий, блакитний, зелений, фіолетовий, жовтий…)
export const CATEGORICAL = ['#d9578a', '#5b9cf0', '#86c06c', '#8b6fd6', '#f0b443', '#3fbfb0', '#f27b4f', '#9aa5b1'];
const GREEN = '#8cc97a';
const RED = '#f08080';

export function formatHours(h: number | null): string {
  if (h == null) return '';
  if (h < 1) return 'до 1г';
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return d ? `${d}д ${r}г` : `${r}г`;
}

function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

// Картка графіка: заголовок, підзаголовок «За весь період», вміст
export function ChartCard({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-6 shadow-card ${className}`}>
      <h3 className="text-lg font-bold tracking-tight text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Велике число з підписом (як «24д — Середня тривалість роботи…»)
export function KpiTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-3xl bg-soft p-5">
      <div className="text-sm font-bold text-ink">{label}</div>
      <div className="text-xs text-ink-soft">За весь період</div>
      <div className="my-4 text-center text-5xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="border-t border-ink/10 pt-2 text-center text-xs text-ink-soft">{caption}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Горизонтальні смуги з віссю і сіткою: «Час роботи над поточними вакансіями»
// ---------------------------------------------------------------------
const ROWS_PER_COLUMN = 6;

export function HBarChart({ items, unit = 'днів' }: { items: { id: string; label: string; value: number; color: string; href?: string }[]; unit?: string }) {
  // Фіксована висота: по 6 смуг у стовпчику; більше — наступний стовпчик поруч праворуч
  if (!items.length) return <div className="flex h-[16.5rem] items-center justify-center text-sm text-ink-soft">Відкритих вакансій немає.</div>;
  const ticks = niceTicks(Math.max(...items.map((i) => i.value)));
  const top = ticks[ticks.length - 1] || 1;
  const columns: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += ROWS_PER_COLUMN) columns.push(items.slice(i, i + ROWS_PER_COLUMN));
  const multi = columns.length > 1;
  const labelW = multi ? '6.5rem' : '9.5rem';
  return (
    <div className="flex h-[16.5rem] gap-6 overflow-x-auto overflow-y-hidden">
      {columns.map((col, ci) => (
        <div key={ci} className="flex min-w-[15rem] flex-1 flex-col">
          <div className="relative flex-1">
            {/* сітка */}
            <div className="pointer-events-none absolute inset-y-0 right-9" style={{ left: labelW }} aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: `${(t / top) * 100}%` }} />
              ))}
            </div>
            <ul className="relative flex h-full flex-col justify-start gap-3 py-1">
              {col.map((v) => (
                <li key={v.id} title={`${v.label}: ${v.value} ${unit}`} className="grid h-6 items-center text-xs" style={{ gridTemplateColumns: `${labelW} minmax(0,1fr) 2.25rem` }}>
                  {v.href ? (
                    <a href={v.href} className="truncate pr-3 text-right text-ink-soft hover:text-ink hover:underline">{v.label}</a>
                  ) : (
                    <span className="truncate pr-3 text-right text-ink-soft">{v.label}</span>
                  )}
                  <span className="relative h-6">
                    <span className="bar-3d absolute inset-y-0 left-0 rounded-r-lg" style={{ width: `${Math.max(1, (v.value / top) * 100)}%`, backgroundColor: v.color }} />
                  </span>
                  <span className="pl-2 font-medium tabular-nums text-ink">{v.value}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* вісь */}
          <div className="relative mr-9 mt-1 h-4 border-t border-line text-[10px] text-ink-soft" style={{ marginLeft: labelW }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 pt-0.5" style={{ left: `${(t / top) * 100}%` }}>{t}</span>
            ))}
            <span className="absolute -right-9 pt-0.5">{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Воронка рекрутингу: зелене — пройшли/на етапі, червоне — вибули; підказка з розбивкою відмов
// ---------------------------------------------------------------------
export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const first = rows[0]?.reached ?? 0;
  if (!first) return <div className="flex items-center justify-center text-sm text-ink-soft" style={{ height: `${Math.max(4, rows.length) * 2.5}rem` }}>Кандидатів у воронці ще немає.</div>;
  const ticks = niceTicks(Math.max(...rows.map((r) => r.reached)), 4);
  const top = ticks[ticks.length - 1] || 1;
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-[8.5rem] right-16" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute inset-y-0 border-l border-line/80" style={{ left: `${(t / top) * 100}%` }} />
        ))}
      </div>
      <ul className="relative space-y-3">
        {rows.map((r) => {
          const out = r.rejected_company + r.rejected_candidate;
          const stay = Math.max(0, r.reached - out);
          const pct = Math.round((r.reached / first) * 100);
          return (
            <li key={r.name} className="group grid grid-cols-[8.5rem_minmax(0,1fr)_4rem] items-center">
              <span className="min-w-0 pr-3 text-right">
                <span className="block truncate text-xs font-semibold text-ink" title={r.name}>{r.name}</span>
                {r.avg_hours != null && <span className="block text-[10px] text-ink-soft">{formatHours(r.avg_hours)}</span>}
              </span>
              <span className="relative flex h-7 items-stretch">
                {stay > 0 && (
                  <span
                    className="bar-3d flex items-center justify-center text-[11px] font-semibold text-ink/80"
                    style={{ width: `${(stay / top) * 100}%`, backgroundColor: GREEN, borderRadius: out ? '3px 0 0 3px' : '3px' }}
                  >
                    {stay / top > 0.05 ? stay : ''}
                  </span>
                )}
                {out > 0 && (
                  <span
                    className="bar-3d flex items-center justify-center text-[11px] font-semibold text-ink/80"
                    style={{ width: `${(out / top) * 100}%`, backgroundColor: RED, borderRadius: stay ? '0 3px 3px 0' : '3px' }}
                  >
                    {out / top > 0.04 ? out : ''}
                  </span>
                )}
                {r.reached === 0 && <span className="w-0.5 rounded bg-line" />}
                {/* підказка */}
                <span className="pointer-events-none absolute left-0 top-8 z-20 hidden min-w-56 rounded-lg border border-line bg-white p-3 text-xs shadow-xl group-hover:block">
                  <span className="mb-1.5 block font-semibold text-ink">{r.name}</span>
                  <span className="flex justify-between gap-4"><span className="text-ink-soft">Дійшли до етапу:</span><b>{r.reached}</b></span>
                  <span className="flex justify-between gap-4"><span className="text-ink-soft">Відмови компанії:</span><b>{r.rejected_company}{out ? ` (${Math.round((r.rejected_company / out) * 100)}%)` : ''}</b></span>
                  <span className="flex justify-between gap-4"><span className="text-ink-soft">Відмова кандидата:</span><b>{r.rejected_candidate}{out ? ` (${Math.round((r.rejected_candidate / out) * 100)}%)` : ''}</b></span>
                  {r.avg_hours != null && (
                    <span className="flex justify-between gap-4"><span className="text-ink-soft">Час на етапі:</span><b>{formatHours(r.avg_hours)}</b></span>
                  )}
                </span>
              </span>
              <span className="pl-2 text-xs tabular-nums">
                <b className="text-ink">{r.reached}</b> <span className="text-ink-soft">{pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Кругова діаграма-інфографіка: розсунуті сектори різної висоти, відсотки всередині,
// тінь і відблиск (об'єм), підписи з кольоровими кружечками під діаграмою
// ---------------------------------------------------------------------
export function PieChart({ items, empty, label }: { items: Slice[]; empty: string; label: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return <div className="flex h-[22rem] w-full items-center justify-center text-sm text-ink-soft">{empty}</div>;
  const W = 260;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2 - 4;
  const pct = (n: number) => Math.round((n / total) * 1000) / 10;
  const sorted = [...items].sort((p, q) => q.count - p.count);
  let a = -Math.PI / 2;
  const segs = sorted.map((i, k) => {
    const a0 = a;
    const a1 = a + (i.count / total) * Math.PI * 2;
    a = a1;
    return { ...i, a0, a1, mid: (a0 + a1) / 2, r: Math.max(76, 98 - k * 6) };
  });
  const path = (s: (typeof segs)[number]) => {
    const { r } = s;
    if (s.a1 - s.a0 >= Math.PI * 2 - 1e-6) return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
    const ox = segs.length > 1 ? 4 * Math.cos(s.mid) : 0;
    const oy = segs.length > 1 ? 4 * Math.sin(s.mid) : 0;
    const x0 = cx + ox + r * Math.cos(s.a0);
    const y0 = cy + oy + r * Math.sin(s.a0);
    const x1 = cx + ox + r * Math.cos(s.a1);
    const y1 = cy + oy + r * Math.sin(s.a1);
    return `M${cx + ox},${cy + oy} L${x0},${y0} A${r},${r} 0 ${s.a1 - s.a0 > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
  };
  const gid = `pie-${label.length}-${total}-${items.length}`;
  return (
    <div className="flex h-[22rem] flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-[14.5rem] w-auto max-w-full" role="img" aria-label={`${label}: ${sorted.map((i) => `${i.name} ${pct(i.count)}%`).join(', ')}`}>
        <defs>
          <radialGradient id={`${gid}-sheen`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.12" />
          </radialGradient>
          <filter id={`${gid}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#141428" floodOpacity="0.22" />
          </filter>
        </defs>
        <g filter={`url(#${gid}-shadow)`}>
          {segs.map((s) => (
            <g key={s.name} className="origin-center transition-transform duration-200 hover:scale-[1.04]" style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <path d={path(s)} fill={s.color} stroke="#fff" strokeWidth={1.5} />
              <path d={path(s)} fill={`url(#${gid}-sheen)`} pointerEvents="none" />
              <title>{`${s.name}: ${s.count} (${pct(s.count)}%)`}</title>
            </g>
          ))}
        </g>
        {segs.map((s) =>
          s.a1 - s.a0 > 0.38 ? (
            <text
              key={`t-${s.name}`}
              x={segs.length === 1 ? cx : cx + s.r * 0.6 * Math.cos(s.mid)}
              y={(segs.length === 1 ? cy : cy + s.r * 0.6 * Math.sin(s.mid)) + 4.5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#fff"
              pointerEvents="none"
              style={{ paintOrder: 'stroke', stroke: 'rgb(0 0 0 / 0.15)', strokeWidth: 2 }}
            >
              {Math.round((s.count / total) * 100)}%
            </text>
          ) : null,
        )}
      </svg>
      <ul className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto text-xs">
        {segs.map((s) => (
          <li key={s.name} className="flex min-w-0 items-center gap-2" title={`${s.name}: ${s.count} (${pct(s.count)}%)`}>
            <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white shadow-[0_1px_3px_rgb(20_20_40/0.3)]" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink">{s.name}</span>
              <span className="block text-[11px] text-ink-soft tabular-nums">
                {s.count} · {pct(s.count)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
