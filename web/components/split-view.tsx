'use client';
import { useState, type ReactNode } from 'react';

// Дашборд KAN Talent і HomeHub поруч. Перемикач лише ховає/показує HomeHub — без переходу на іншу сторінку.
export function SplitView({ left, right }: { left: ReactNode; right: ReactNode | null }) {
  const [both, setBoth] = useState(true);
  if (!right) return <>{left}</>;
  const btn = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-accent text-on-accent' : 'text-ink-soft hover:bg-panel'}`;
  return (
    <div>
      <div className="-mt-2 mb-4 flex justify-end">
        <div className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-card" role="group" aria-label="Вигляд дашборда">
          <button type="button" aria-pressed={!both} onClick={() => setBoth(false)} className={btn(!both)}>
            Лише KAN Talent
          </button>
          <button type="button" aria-pressed={both} onClick={() => setBoth(true)} className={btn(both)}>
            KAN + HomeHub
          </button>
        </div>
      </div>
      <div className={both ? 'grid items-start gap-5 lg:grid-cols-2 2xl:gap-6' : ''}>
        <div className="min-w-0 space-y-5">{left}</div>
        <div className={both ? 'min-w-0 space-y-5' : 'hidden'}>{right}</div>
      </div>
    </div>
  );
}
