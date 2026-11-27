'use client';
import { useState, type ReactNode } from 'react';
import { rescheduleInterview } from '@/app/(app)/calendar/actions';

export const DRAG_TYPE = 'application/x-kan-interview';
export type DragPayload = { id: string; duration: number; offsetY: number; name: string };

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Колонка дня: сюди можна перетягнути зустріч, щоб перенести її на інший час або день
export function CalendarDay({
  date,
  gridStart,
  slotMin,
  slotPx,
  className,
  children,
}: {
  date: string;
  gridStart: number;
  slotMin: number;
  slotPx: number;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div
      className={`${className ?? ''} ${over ? 'bg-accent-soft/40' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        setOver(false);
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (!raw || busy) return;
        e.preventDefault();
        const p = JSON.parse(raw) as DragPayload;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top - p.offsetY;
        let minutes = gridStart + Math.round(((y / slotPx) * slotMin) / 15) * 15;
        minutes = Math.max(0, Math.min(24 * 60 - p.duration, minutes));
        const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
        const when = `${DAY.format(new Date(`${date}T00:00:00Z`))}, ${time}`;
        if (!window.confirm(`Перенести зустріч «${p.name}» на ${when}?\nУчасники отримають сповіщення з календаря.`)) return;
        const fd = new FormData();
        fd.set('id', p.id);
        fd.set('date', date);
        fd.set('time', time);
        fd.set('duration', String(p.duration));
        setBusy(true);
        const r = await rescheduleInterview(fd);
        setBusy(false);
        if (r.error) window.alert(r.error);
      }}
    >
      {children}
      {busy && <div className="pointer-events-none absolute inset-0 z-30 animate-pulse bg-white/40" />}
    </div>
  );
}
