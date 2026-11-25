// Графіки аналітики — легкий SVG/HTML без сторонніх бібліотек (рендеряться на сервері)
import { pct, periodLabel, type Analytics } from '@/lib/analytics';

// Кольори серій перевірено на розрізнюваність (у т.ч. для дальтонізму); підписи — завжди текстом
const SERIES = [
  { key: 'opened', label: 'Відкрито вакансій', color: '#257de0' },
  { key: 'closed', label: 'Закрито вакансій', color: '#6a4ce2' },
  { key: 'hires', label: 'Найнято', color: '#f47230' },
] as const;

export function DynamicsChart({ data, bucket }: { data: Analytics['dynamics']; bucket: Analytics['bucket'] }) {
  const max = Math.max(1, ...data.flatMap((d) => SERIES.map((s) => d[s.key])));
  const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const H = 180;
  const groupW = 44;
  const barW = 10;
  const gap = 2;
  const left = 28;
  const width = left + data.length * groupW + 8;
  const y = (v: number) => H - (v / top) * H;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-soft">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={H + 28} role="img" aria-label="Динаміка вакансій і найму за період" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t) + 4} y2={y(t) + 4} stroke="var(--color-line)" strokeWidth={t === 0 ? 1 : 0.5} />
              <text x={left - 6} y={y(t) + 8} textAnchor="end" fontSize="10" fill="var(--color-ink-soft)">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const gx = left + i * groupW + (groupW - (barW * 3 + gap * 2)) / 2;
            return (
              <g key={d.period}>
                <title>
                  {`${periodLabel(d.period, bucket)}: ${SERIES.map((s) => `${s.label.toLowerCase()} ${d[s.key]}`).join(', ')}; нових кандидатів ${d.candidates}`}
                </title>
                <rect x={left + i * groupW} y={0} width={groupW} height={H + 4} fill="transparent" className="hover:fill-[var(--color-surface)]" />
                {SERIES.map((s, si) => {
                  const v = d[s.key];
                  if (!v) return null;
                  const h = Math.max(2, (v / top) * H);
                  return (
                    <path
                      key={s.key}
                      d={roundedTop(gx + si * (barW + gap), y(v) + 4, barW, h, 3)}
                      fill={s.color}
                    />
                  );
                })}
                <text x={left + i * groupW + groupW / 2} y={H + 22} textAnchor="middle" fontSize="10" fill="var(--color-ink-soft)">
                  {periodLabel(d.period, bucket)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-ink-soft">Показати таблицею</summary>
        <table className="mt-2 w-full max-w-xl">
          <thead className="text-left text-ink-soft">
            <tr>
              <th className="py-1 font-medium">{bucket === 'month' ? 'Місяць' : 'Тиждень з'}</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-1 font-medium">{s.label}</th>
              ))}
              <th className="py-1 font-medium">Нових кандидатів</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((d) => (
              <tr key={d.period}>
                <td className="py-1">{periodLabel(d.period, bucket)}</td>
                <td className="py-1">{d.opened}</td>
                <td className="py-1">{d.closed}</td>
                <td className="py-1">{d.hires}</td>
                <td className="py-1">{d.candidates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function roundedTop(x: number, yTop: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  const yb = yTop + h;
  return `M${x},${yb} V${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} H${x + w - rr} Q${x + w},${yTop} ${x + w},${yTop + rr} V${yb} Z`;
}

// Воронка: скільки відгуків дійшли до кожного етапу; ширина — від першого етапу
export function FunnelBars({ data }: { data: Analytics['funnel'] }) {
  const first = data[0]?.count ?? 0;
  if (!first) return <p className="text-sm text-ink-soft">За цей період нових відгуків не було.</p>;
  return (
    <ul className="space-y-1.5">
      {data.map((s, i) => {
        const prev = i > 0 ? data[i - 1].count : null;
        return (
          <li key={s.name} className="grid grid-cols-[11rem_minmax(0,1fr)_7rem] items-center gap-3 text-sm">
            <span className="truncate" title={s.name}>{s.name}</span>
            <div className="h-5 rounded bg-surface" title={`${s.name}: ${s.count} (${pct(s.count, first)} від усіх відгуків)`}>
              <div className="h-full rounded" style={{ width: `${Math.max(s.count ? 1.5 : 0, (s.count / first) * 100)}%`, background: '#257de0' }} />
            </div>
            <span className="text-right tabular-nums">
              <b>{s.count}</b>
              <span className="ml-1 text-xs text-ink-soft">{prev != null ? pct(s.count, prev) : '100%'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
