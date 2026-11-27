'use client';
import { useState, useTransition } from 'react';
import { setVacancyStage } from '@/app/(app)/vacancies/actions';

type S = { id: string; name: string; color: string; kind: string };

// Набір етапів воронки для цієї вакансії: зайві етапи можна вимкнути (зберігається одразу)
export function VacancyStages({ vacancyId, stages, hidden }: { vacancyId: string; stages: S[]; hidden: string[] }) {
  const [off, setOff] = useState(new Set(hidden));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const firstId = stages[0]?.id;

  return (
    <details className="mb-3 rounded-2xl bg-white p-4 shadow-card">
      <summary className="cursor-pointer select-none text-sm font-semibold">
        Етапи цієї вакансії <span className="font-normal text-ink-soft">({stages.length - off.size} з {stages.length}) — налаштувати</span>
      </summary>
      <p className="mt-2 text-xs text-ink-soft">
        Зніміть галочку з етапів, які не потрібні для цієї посади. Перший етап, офер, вихід на роботу і відмови — обов’язкові.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stages.map((s) => {
          const locked = s.kind !== 'open' || s.id === firstId;
          const on = !off.has(s.id);
          return (
            <label
              key={s.id}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-line bg-panel' : 'border-dashed border-line text-ink-soft line-through'} ${locked ? 'opacity-70' : 'cursor-pointer'}`}
              title={locked ? 'Обов’язковий етап' : undefined}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={locked || busy}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setOff((prev) => {
                    const n = new Set(prev);
                    if (enabled) n.delete(s.id);
                    else n.add(s.id);
                    return n;
                  });
                  start(async () => {
                    const r = await setVacancyStage(vacancyId, s.id, enabled);
                    if (r.error) {
                      setError(r.error);
                      setOff((prev) => {
                        const n = new Set(prev);
                        if (enabled) n.add(s.id);
                        else n.delete(s.id);
                        return n;
                      });
                    } else setError(null);
                  });
                }}
                className="h-4 w-4 accent-[var(--color-accent-strong)]"
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              {s.name}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </details>
  );
}
