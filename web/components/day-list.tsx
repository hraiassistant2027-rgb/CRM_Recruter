'use client';
import { useState } from 'react';
import { Button, Select } from '@/components/ui';

export type DayList = { date: string; label: string; text: string; count: number };

// Список зустрічей на обрану дату — для копіювання і відправки керівнику
export function DayListButton({ days, defaultDate }: { days: DayList[]; defaultDate: string }) {
  const withEvents = days.filter((d) => d.count > 0);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(withEvents.find((d) => d.date >= defaultDate)?.date ?? withEvents[0]?.date ?? defaultDate);
  const [copied, setCopied] = useState(false);
  const current = days.find((d) => d.date === date);

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" onClick={() => setOpen((v) => !v)} disabled={withEvents.length === 0}>
        {open ? 'Сховати список' : 'Сформувати список зустрічей'}
      </Button>
      {open && (
        <div className="space-y-2 rounded-lg border border-line bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={date} onChange={(e) => { setDate(e.target.value); setCopied(false); }} aria-label="Дата" className="max-w-72">
              {withEvents.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.label} — {d.count}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              onClick={async () => {
                if (!current) return;
                try {
                  await navigator.clipboard.writeText(current.text);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Скопійовано ✓' : 'Скопіювати'}
            </Button>
          </div>
          <textarea
            readOnly
            value={current?.text ?? ''}
            rows={Math.min(18, (current?.text.split('\n').length ?? 4) + 1)}
            aria-label="Список зустрічей"
            onFocus={(e) => e.currentTarget.select()}
            className="block w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-ink-soft">Вставте в месенджер або лист керівнику. Скасовані зустрічі до списку не потрапляють.</p>
        </div>
      )}
    </div>
  );
}
