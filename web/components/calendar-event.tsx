'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addInterviewNote, rescheduleInterview } from '@/app/(app)/calendar/actions';
import { DRAG_TYPE, type DragPayload } from '@/components/calendar-day';

export type CalendarNote = { id: string; body: string; created_at: string; author: string | null };

export type CalendarEventData = {
  id: string;
  date: string; // YYYY-MM-DD (Київ)
  time: string;
  duration: number; // хв
  kindLabel: string;
  kindColor: string;
  statusLabel: string | null;
  faded: boolean;
  candidateId: string | null;
  candidateName: string;
  position: string;
  phone: string | null;
  recruiter: string | null;
  meetLink: string | null;
  canMove: boolean;
  notes: CalendarNote[];
};

const C = { candidate: '#1A1A7A', position: '#B45309', phone: '#15803D', recruiter: '#BE185D' };
const NOTE_DATE = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });

// Прізвище та ім'я (без по батькові)
const shortName = (full: string) => full.trim().split(/\s+/).slice(0, 2).join(' ');

// Подія в календарі: коротко — прізвище, ім'я і посада; при наведенні розгортається.
// Натискання — нотатка до зустрічі. Загнутий куточок — до зустрічі вже є нотатки.
// Власник зустрічі може перетягнути її на інший час/день або перенести через «Перенести».
export function CalendarEvent({ e, box }: { e: CalendarEventData; box: { top: number; height: number; left: string; width: string } }) {
  const [hover, setHover] = useState(false);
  const [mode, setMode] = useState<'view' | 'note' | 'move'>('view');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState(e.notes);
  const [date, setDate] = useState(e.date);
  const [time, setTime] = useState(e.time);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  const open = hover || mode !== 'view';

  const close = () => {
    setMode('view');
    setHover(false);
    setText('');
  };

  const saveNote = () =>
    start(async () => {
      const r = await addInterviewNote(e.id, text);
      if (r.error || !r.note) return setMsg({ error: r.error ?? 'Не вдалося зберегти' });
      setNotes((n) => [{ ...r.note!, author: 'ви' }, ...n]);
      setMsg(null);
      close();
    });

  const move = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('id', e.id);
      fd.set('date', date);
      fd.set('time', time);
      fd.set('duration', String(e.duration));
      const r = await rescheduleInterview(fd);
      if (r.error) return setMsg({ error: r.error });
      setMsg(null);
      close();
    });

  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();

  return (
    <div
      draggable={e.canMove && mode === 'view'}
      onDragStart={(ev) => {
        const payload: DragPayload = { id: e.id, duration: e.duration, offsetY: ev.clientY - ev.currentTarget.getBoundingClientRect().top, name: shortName(e.candidateName) };
        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
        ev.dataTransfer.effectAllowed = 'move';
        setHover(false);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (mode === 'view' && e.candidateId) {
          setMode('note');
          setMsg(null);
        }
      }}
      className={`absolute rounded-md border border-line bg-white text-[11px] leading-tight transition-shadow ${e.canMove && mode === 'view' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
        open ? 'z-20 shadow-lg' : 'overflow-hidden shadow-sm'
      } ${e.faded && !open ? 'opacity-60' : ''}`}
      style={{
        top: box.top,
        height: open ? 'auto' : box.height,
        minHeight: box.height,
        left: box.left,
        width: open ? `max(${box.width}, 16rem)` : box.width,
        borderLeft: `4px solid ${e.kindColor}`,
      }}
      title={open ? undefined : `${e.candidateName} · ${e.position}${notes.length ? ` · нотаток: ${notes.length}` : ''}`}
    >
      <div className="px-1.5 py-1 pr-3">
        <div className={open ? 'font-semibold' : 'truncate font-semibold'} style={{ color: C.candidate }}>
          {open ? e.candidateName : shortName(e.candidateName)}
        </div>
        <div className={open ? 'font-medium' : 'truncate font-medium'} style={{ color: C.position }}>
          {e.position}
        </div>

        {open && (
          <div className="mt-1 space-y-0.5" onClick={(ev) => mode !== 'view' && stop(ev)}>
            <div className="text-ink-soft">
              {e.time} · {e.kindLabel}
              {e.statusLabel ? ` · ${e.statusLabel}` : ''}
            </div>
            {e.phone && <div className="font-medium" style={{ color: C.phone }}>{e.phone}</div>}
            {e.recruiter && <div className="font-medium" style={{ color: C.recruiter }}>{e.recruiter}</div>}

            <div className="flex flex-wrap gap-1 pt-1">
              {e.meetLink && (
                <a href={e.meetLink} target="_blank" rel="noopener noreferrer" onClick={stop} className="rounded bg-[#1A73E8] px-1.5 py-0.5 font-semibold text-white">
                  ▶ Google Meet
                </a>
              )}
              {e.candidateId && (
                <Link href={`/candidates/${e.candidateId}`} onClick={stop} className="rounded border border-line bg-white px-1.5 py-0.5 text-ink-soft hover:text-ink">
                  Картка кандидата
                </Link>
              )}
              {e.canMove && mode !== 'move' && (
                <button
                  type="button"
                  onClick={(ev) => {
                    stop(ev);
                    setMode('move');
                    setMsg(null);
                  }}
                  className="rounded border border-line bg-white px-1.5 py-0.5 text-ink-soft hover:text-ink"
                >
                  Перенести
                </button>
              )}
            </div>

            {notes.length > 0 && (
              <div className="space-y-1 border-t border-line pt-1">
                <div className="font-semibold text-ink-soft">Нотатки</div>
                {notes.slice(0, 4).map((n) => (
                  <div key={n.id} className="rounded bg-[#fff6d6] px-1.5 py-1 text-ink">
                    <div className="whitespace-pre-wrap break-words">{n.body}</div>
                    <div className="mt-0.5 text-[10px] text-ink-soft">
                      {NOTE_DATE.format(new Date(n.created_at))}
                      {n.author ? ` · ${n.author}` : ''}
                    </div>
                  </div>
                ))}
                {notes.length > 4 && <div className="text-ink-soft">…ще {notes.length - 4} у картці кандидата</div>}
              </div>
            )}

            {mode === 'note' && (
              <div className="space-y-1 pt-1">
                <textarea
                  autoFocus
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="Нотатка до цієї зустрічі…"
                  className="w-full rounded-md border border-field-line bg-field px-1.5 py-1 text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p className="text-[10px] text-ink-soft">Збережеться тут і в картці кандидата (розділ «Нотатки»).</p>
                <div className="flex gap-1">
                  <button type="button" disabled={busy || !text.trim()} onClick={saveNote} className="rounded bg-accent px-2 py-1 font-semibold text-on-accent disabled:opacity-50">
                    {busy ? '…' : 'Зберегти'}
                  </button>
                  <button type="button" onClick={close} className="rounded border border-line px-2 py-1 text-ink-soft">
                    Скасувати
                  </button>
                </div>
              </div>
            )}

            {mode === 'move' && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1">
                  <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="min-w-0 flex-1 rounded-md border border-field-line bg-field px-1 py-1 text-[12px]" aria-label="Нова дата" />
                  <input type="time" value={time} step={900} onChange={(ev) => setTime(ev.target.value)} className="w-20 rounded-md border border-field-line bg-field px-1 py-1 text-[12px]" aria-label="Новий час" />
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={busy} onClick={move} className="rounded bg-accent px-2 py-1 font-semibold text-on-accent disabled:opacity-50">
                    {busy ? '…' : 'Перенести'}
                  </button>
                  <button type="button" onClick={close} className="rounded border border-line px-2 py-1 text-ink-soft">
                    Скасувати
                  </button>
                </div>
              </div>
            )}

            {msg?.error && <p className="text-danger">{msg.error}</p>}
            {mode === 'view' && e.candidateId && (
              <div className="pt-1 text-ink-soft">
                Натисніть, щоб додати нотатку{e.canMove ? ' · перетягніть, щоб перенести' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Загнутий куточок — до зустрічі є нотатки */}
      {notes.length > 0 && (
        <span
          aria-label={`Нотаток: ${notes.length}`}
          className="pointer-events-none absolute bottom-0 right-0 h-3.5 w-3.5 rounded-tl-[3px]"
          style={{
            background: 'linear-gradient(135deg, #f2d27a 0%, #e8bf4f 49%, #f4f3ef 50%, #f4f3ef 100%)',
            boxShadow: '-1px -1px 2px rgba(0,0,0,0.18)',
            borderBottomRightRadius: 6,
          }}
        />
      )}
    </div>
  );
}
