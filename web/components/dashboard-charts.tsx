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
    <section className={`rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Велике число з підписом (як «24д — Середня тривалість роботи…»)
export function KpiTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="text-xs text-ink-soft">За весь період</div>
      <div className="my-3 text-center text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="border-t border-line pt-2 text-center text-xs text-ink-soft">{caption}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Горизонтальні смуги з віссю і сіткою: «Час роботи над поточними вакансіями»
// ---------------------------------------------------------------------
export function HBarChart({ items, unit = 'днів' }: { items: { id: string; label: string; value: number; color: string; href?: string }[]; unit?: string }) {
  if (!items.length) return <p className="text-sm text-ink-soft">Відкритих вакансій немає.</p>;
  const ticks = niceTicks(Math.max(...items.map((i) => i.value)));
  const top = ticks[ticks.length - 1] || 1;
  return (
    <div>
      <div className="relative">
        {/* сітка */}
        <div className="pointer-events-none absolute inset-y-0 left-[9.5rem] right-10" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: `${(t / top) * 100}%` }} />
          ))}
        </div>
        <ul className="relative max-h-80 space-y-3 overflow-y-auto py-1 pr-1">
          {items.map((v) => (
            <li key={v.id} title={`${v.label}: ${v.value} ${unit}`} className="group grid grid-cols-[9.5rem_minmax(0,1fr)_2.5rem] items-center text-xs">
              {v.href ? (
                <a href={v.href} className="truncate pr-3 text-right text-ink-soft hover:text-ink hover:underline" title={v.label}>{v.label}</a>
              ) : (
                <span className="truncate pr-3 text-right text-ink-soft" title={v.label}>{v.label}</span>
              )}
              <span className="relative h-6">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-md transition-[filter] group-hover:brightness-95"
                  style={{ width: `${Math.max(1, (v.value / top) * 100)}%`, background: v.color }}
                />
                <span
                  className="pointer-events-none absolute top-0.5 z-10 ml-2 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white shadow-lg group-hover:block"
                  style={{ left: `${Math.min(85, (v.value / top) * 100)}%` }}
                >
                  {v.label}: {v.value} {unit}
                </span>
              </span>
              <span className="pl-2 font-medium tabular-nums text-ink">{v.value}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* вісь */}
      <div className="relative ml-[9.5rem] mr-10 mt-1 h-4 border-t border-line text-[10px] text-ink-soft" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 pt-0.5" style={{ left: `${(t / top) * 100}%` }}>{t}</span>
        ))}
        <span className="absolute -right-10 pt-0.5">{unit}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Воронка рекрутингу: зелене — пройшли/на етапі, червоне — вибули; підказка з розбивкою відмов
// ---------------------------------------------------------------------
export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const first = rows[0]?.reached ?? 0;
  if (!first) return <p className="text-sm text-ink-soft">Кандидатів у воронці ще немає.</p>;
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
                    className="flex items-center justify-center text-[11px] font-semibold text-ink/80"
                    style={{ width: `${(stay / top) * 100}%`, background: GREEN, borderRadius: out ? '3px 0 0 3px' : '3px' }}
                  >
                    {stay / top > 0.05 ? stay : ''}
                  </span>
                )}
                {out > 0 && (
                  <span
                    className="flex items-center justify-center text-[11px] font-semibold text-ink/80"
                    style={{ width: `${(out / top) * 100}%`, background: RED, borderRadius: stay ? '0 3px 3px 0' : '3px' }}
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
// Кругова діаграма з виносками «Назва — 10.9 %» (як у зразку)
// ---------------------------------------------------------------------
export function PieChart({ items, empty, label }: { items: Slice[]; empty: string; label: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return <p className="py-6 text-center text-sm text-ink-soft">{empty}</p>;
  const W = 540;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  const R = 88;
  const fmt = (n: number) => `${Math.round((n / total) * 1000) / 10} %`;
  // Найбільший сектор — праворуч, як у зразку
  let a = -Math.PI / 2;
  const segs = items.map((i) => {
    const a0 = a;
    const a1 = a + (i.count / total) * Math.PI * 2;
    a = a1;
    return { ...i, a0, a1, mid: (a0 + a1) / 2 };
  });
  const path = (a0: number, a1: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0`;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    return `M${cx},${cy} L${x0},${y0} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
  };
  // Підписи: ліворуч і праворуч від кола, без накладань (мінімум 15 px між рядками)
  type L = { seg: (typeof segs)[number]; side: 1 | -1; y: number; ex: number; ey: number };
  const labels: L[] = segs.map((s) => {
    const ex = cx + (R + 4) * Math.cos(s.mid);
    const ey = cy + (R + 4) * Math.sin(s.mid);
    return { seg: s, side: Math.cos(s.mid) >= 0 ? 1 : -1, y: cy + (R + 22) * Math.sin(s.mid), ex, ey };
  });
  for (const side of [1, -1] as const) {
    const col = labels.filter((l) => l.side === side).sort((p, q) => p.y - q.y);
    for (let i = 1; i < col.length; i++) if (col[i].y - col[i - 1].y < 15) col[i].y = col[i - 1].y + 15;
    const overflow = col.length ? col[col.length - 1].y - (H - 8) : 0;
    if (overflow > 0) for (const l of col) l.y -= overflow;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label}: ${items.map((i) => `${i.name} ${fmt(i.count)}`).join(', ')}`}>
      {segs.map((s) => (
        <path key={s.name} d={path(s.a0, s.a1)} fill={s.color} stroke="#fff" strokeWidth={2} className="transition-opacity hover:opacity-85">
          <title>{`${s.name}: ${s.count} (${fmt(s.count)})`}</title>
        </path>
      ))}
      {labels.map((l) => {
        const kx = cx + l.side * (R + 26);
        const tx = kx + l.side * 6;
        return (
          <g key={l.seg.name}>
            <polyline points={`${l.ex},${l.ey} ${kx},${l.y} ${kx + l.side * 4},${l.y}`} fill="none" stroke="#9aa5b1" strokeWidth={0.8} />
            <text x={tx} y={l.y + 3.5} fontSize="10" textAnchor={l.side > 0 ? 'start' : 'end'} fill="var(--color-ink)">
              {l.seg.name.length > 22 ? `${l.seg.name.slice(0, 21)}…` : l.seg.name} — {fmt(l.seg.count)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
