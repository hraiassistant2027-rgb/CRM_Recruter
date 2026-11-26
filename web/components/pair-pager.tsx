'use client';
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Показує записи парами (по 2) у блоках однакової висоти; стрілки перемикають на наступну пару
export function PairPager({
  items,
  perPage = 2,
  slotClass,
  label,
  onPageChange,
}: {
  items: ReactNode[];
  perPage?: number;
  slotClass: string;
  label: string;
  onPageChange?: (firstIndex: number) => void;
}) {
  const [page, setPageState] = useState(0);
  const setPage = (n: number) => {
    setPageState(n);
    onPageChange?.(n * perPage);
  };
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(page, pages - 1);
  const shown = items.slice(p * perPage, p * perPage + perPage);
  const from = items.length ? p * perPage + 1 : 0;
  const to = Math.min(items.length, p * perPage + perPage);
  return (
    <div>
      <ul className="divide-y divide-line">
        {shown.map((it, i) => (
          <li key={p * perPage + i} className={slotClass}>
            {it}
          </li>
        ))}
        {/* порожні місця, щоб блок не змінював висоту на останній сторінці */}
        {Array.from({ length: perPage - shown.length }, (_, i) => (
          <li key={`empty-${i}`} className={slotClass} aria-hidden />
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-3 text-sm">
        <span className="mr-1 text-ink-soft tabular-nums">
          {from}–{to} з {items.length}
        </span>
        <button
          type="button"
          onClick={() => setPage(p - 1)}
          disabled={p === 0}
          aria-label={`${label}: попередні`}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-panel hover:bg-accent-soft disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setPage(p + 1)}
          disabled={p >= pages - 1}
          aria-label={`${label}: наступні`}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-panel hover:bg-accent-soft disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// Однаковий рядок підказки під заголовком обох блоків (фіксована висота)
export function InfoStrip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' }) {
  return (
    <p className={`mb-2 flex h-9 items-center gap-2 truncate rounded-2xl px-3 text-xs ${tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-panel text-ink-soft'}`}>
      {children}
    </p>
  );
}
