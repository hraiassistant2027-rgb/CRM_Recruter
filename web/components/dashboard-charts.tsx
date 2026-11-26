// Графіки дашборда (SVG/HTML без сторонніх бібліотек, рендеряться на сервері).
// Числа завжди підписані текстом; колір лише допомагає, а не несе значення сам.

export type FunnelRow = { name: string; reached: number; rejected_company: number; rejected_candidate: number; avg_hours: number | null };
export type Slice = { name: string; count: number; color: string };

// Категоріальна палітра (перевірена на розрізнюваність, у т.ч. для дальтонізму) — у фіксованому порядку
export const CATEGORICAL = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647'];
const OK = '#4caf50';
const BAD = '#ef5350';

export function formatHours(h: number | null): string {
  if (h == null) return '';
  if (h < 1) return 'до 1г';
  const d = Math.floor(h / 24);
  const r = Math.round(h % 24);
  return d ? `${d}д ${r}г` : `${r}г`;
}

// Воронка: скільки кандидатів дійшли до етапу (зелене — пройшли далі або ще на етапі, червоне — вибули на етапі)
export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const first = rows[0]?.reached ?? 0;
  if (!first) return <p className="text-sm text-ink-soft">Кандидатів у воронці ще немає.</p>;
  const max = Math.max(1, ...rows.map((r) => r.reached));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const out = r.rejected_company + r.rejected_candidate;
        const stay = Math.max(0, r.reached - out);
        const tip = out
          ? `${r.name}: дійшли ${r.reached}. Відмова компанії: ${r.rejected_company}, відмова кандидата: ${r.rejected_candidate}`
          : `${r.name}: дійшли ${r.reached}`;
        return (
          <li key={r.name} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm" title={tip}>
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.name}</span>
              {r.avg_hours != null && <span className="block text-[11px] text-ink-soft">у середньому {formatHours(r.avg_hours)}</span>}
            </span>
            <span className="flex h-6 items-stretch gap-0.5">
              {stay > 0 && (
                <span
                  className="flex items-center justify-center rounded-l text-[11px] font-medium text-white"
                  style={{ width: `${(stay / max) * 100}%`, background: OK, borderTopRightRadius: out ? 0 : 4, borderBottomRightRadius: out ? 0 : 4 }}
                >
                  {stay / max > 0.06 ? stay : ''}
                </span>
              )}
              {out > 0 && (
                <span
                  className="flex items-center justify-center rounded-r text-[11px] font-medium text-white"
                  style={{ width: `${(out / max) * 100}%`, background: BAD, borderTopLeftRadius: stay ? 0 : 4, borderBottomLeftRadius: stay ? 0 : 4 }}
                >
                  {out / max > 0.06 ? out : ''}
                </span>
              )}
              {r.reached === 0 && <span className="w-0.5 rounded bg-line" />}
            </span>
            <span className="text-right tabular-nums">
              <b>{r.reached}</b>
              <span className="ml-1 text-xs text-ink-soft">{Math.round((r.reached / first) * 100)}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}

// Кільцева діаграма + підписи з відсотками
export function Donut({ items, empty, label }: { items: Slice[]; empty: string; label: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return <p className="text-sm text-ink-soft">{empty}</p>;
  const R = 54;
  const W = 18;
  let a = -Math.PI / 2;
  const segs = items.map((i) => {
    const a0 = a;
    const a1 = a + (i.count / total) * Math.PI * 2;
    a = a1;
    return { ...i, a0, a1 };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={label} className="shrink-0">
        {segs.length === 1 ? (
          <circle cx={70} cy={70} r={R} fill="none" stroke={segs[0].color} strokeWidth={W}>
            <title>{`${segs[0].name}: ${segs[0].count} (100%)`}</title>
          </circle>
        ) : (
          segs.map((s) => (
            <path key={s.name} d={arc(70, 70, R, s.a0, Math.max(s.a0 + 0.001, s.a1 - 0.02))} fill="none" stroke={s.color} strokeWidth={W}>
              <title>{`${s.name}: ${s.count} (${Math.round((s.count / total) * 1000) / 10}%)`}</title>
            </path>
          ))
        )}
        <text x={70} y={68} textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--color-ink)">{total}</text>
        <text x={70} y={86} textAnchor="middle" fontSize="10" fill="var(--color-ink-soft)">усього</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate" title={i.name}>{i.name}</span>
            <span className="tabular-nums text-ink-soft">{Math.round((i.count / total) * 1000) / 10}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Скільки днів у роботі кожна поточна вакансія (колір — юрособа)
export function OpenVacancyBars({ items }: { items: { id: string; title: string; days: number; color: string }[] }) {
  if (!items.length) return <p className="text-sm text-ink-soft">Відкритих вакансій немає.</p>;
  const max = Math.max(1, ...items.map((i) => i.days));
  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {items.map((v) => (
        <li key={v.id} className="grid grid-cols-[10rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
          <a href={`/vacancies/${v.id}`} className="truncate hover:underline" title={v.title}>{v.title}</a>
          <span className="h-4 rounded-r" style={{ width: `${Math.max(1.5, (v.days / max) * 100)}%`, background: v.color }} title={`${v.title}: ${v.days} дн.`} />
          <span className="text-right tabular-nums text-ink-soft">{v.days} дн.</span>
        </li>
      ))}
    </ul>
  );
}
