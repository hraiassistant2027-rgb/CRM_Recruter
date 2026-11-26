'use client';
import { useState, useTransition } from 'react';
import { loadOverview } from '@/app/(app)/dashboard-actions';
import { CATEGORICAL, ChartCard, FunnelChart, PieChart } from '@/components/dashboard-charts';
import type { Overview } from '@/components/dashboard-types';

// Воронка, причини відмов і джерела з фільтром за вакансією. Фільтр оновлює лише цей блок — сторінка не перезавантажується.
export function FunnelPanel({
  ws,
  initial,
  vacancies,
}: {
  ws: string;
  initial: Pick<Overview, 'funnel' | 'reasons' | 'sources'>;
  vacancies: { id: string; title: string }[];
}) {
  const [vacancy, setVacancy] = useState('');
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const title = vacancy ? vacancies.find((v) => v.id === vacancy)?.title : null;
  const scope = title ? `Вакансія «${title}» · за весь період` : 'За весь період';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label htmlFor={`dash-vacancy-${ws}`} className="text-sm text-ink-soft">
          Воронка, відмови і джерела для
        </label>
        <select
          id={`dash-vacancy-${ws}`}
          value={vacancy}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            setVacancy(v);
            start(async () => {
              const r = await loadOverview(ws, v || null);
              if (r.data) {
                setData(r.data);
                setError(null);
              } else setError(r.error ?? 'Не вдалося оновити дані');
            });
          }}
          className="max-w-64 rounded-xl border border-field-line bg-field px-3 py-1.5 text-sm focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15"
        >
          <option value="">усіх вакансій</option>
          {vacancies.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
        {pending && <span className="text-xs text-ink-soft">оновлюємо…</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <div className={`space-y-5 transition-opacity ${pending ? 'opacity-50' : ''}`} aria-busy={pending}>
        <ChartCard title="Воронка рекрутингу" subtitle={scope}>
          <FunnelChart rows={data.funnel} />
          <p className="mt-4 flex flex-wrap gap-4 text-[11px] text-ink-soft">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8cc97a]" aria-hidden />пройшли етап або ще на ньому</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#f08080]" aria-hidden />вибули на етапі</span>
            <span>Наведіть на рядок — розбивка відмов і час на етапі</span>
          </p>
        </ChartCard>
        <div className="grid gap-5 sm:grid-cols-2">
          <ChartCard title={title ? 'Причини відмов по вакансії' : 'Причини відмов'} subtitle={scope}>
            <PieChart
              label="Причини відмов"
              empty="Відмов ще немає."
              items={data.reasons.map((r, i) => ({
                name: r.side === 'candidate' ? `${r.name} (кандидат)` : r.name,
                count: r.count,
                color: CATEGORICAL[i % CATEGORICAL.length],
              }))}
            />
          </ChartCard>
          <ChartCard title={title ? 'Джерела щодо вакансії' : 'Джерела кандидатів'} subtitle={scope}>
            <PieChart label="Джерела кандидатів" empty="Кандидатів у вакансіях ще немає." items={data.sources} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
