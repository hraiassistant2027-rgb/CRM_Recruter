'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addNote } from '@/app/(app)/candidates/actions';

export type CalendarEventData = {
  id: string;
  time: string;
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
};

const C = { candidate: '#1A1A7A', position: '#B45309', phone: '#15803D', recruiter: '#BE185D' };

// Прізвище та ім'я (без по батькові)
const shortName = (full: string) => full.trim().split(/\s+/).slice(0, 2).join(' ');

// Подія в календарі: коротко — прізвище, ім'я і посада; при наведенні розгортається.
// Натискання відкриває поле нотатки для кандидата; після збереження подія знову згортається.
export function CalendarEvent({ e, box }: { e: CalendarEventData; box: { top: number; height: number; left: string; width: string } }) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  const open = hover || editing;

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('candidate_id', e.candidateId ?? '');
      fd.set('body', text);
      const r = await addNote({}, fd);
      if (r.error) return setMsg({ error: r.error });
      setText('');
      setEditing(false);
      setHover(false);
      setMsg({ ok: 'Нотатку додано' });
      setTimeout(() => setMsg(null), 2500);
    });

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (!editing && e.candidateId) {
          setEditing(true);
          setMsg(null);
        }
      }}
      className={`absolute cursor-pointer rounded-md border border-line bg-white text-[11px] leading-tight transition-shadow ${
        open ? 'z-20 shadow-lg' : 'overflow-hidden shadow-sm'
      } ${e.faded && !open ? 'opacity-60' : ''}`}
      style={{
        top: box.top,
        height: open ? 'auto' : box.height,
        minHeight: box.height,
        left: box.left,
        width: open ? `max(${box.width}, 15rem)` : box.width,
        borderLeft: `4px solid ${e.kindColor}`,
      }}
      title={open ? undefined : `${e.candidateName} · ${e.position}`}
    >
      <div className="px-1.5 py-1">
        <div className="truncate font-semibold" style={{ color: C.candidate }}>
          {msg?.ok && !open ? '✓ ' : ''}
          {shortName(e.candidateName)}
        </div>
        <div className="truncate font-medium" style={{ color: C.position }}>
          {e.position}
        </div>

        {open && (
          <div className="mt-1 space-y-0.5" onClick={(ev) => editing && ev.stopPropagation()}>
            <div className="text-ink-soft">
              {e.time} · {e.kindLabel}
              {e.statusLabel ? ` · ${e.statusLabel}` : ''}
            </div>
            <div className="font-medium" style={{ color: C.candidate }}>{e.candidateName}</div>
            {e.phone && (
              <div className="font-medium" style={{ color: C.phone }}>
                {e.phone}
              </div>
            )}
            {e.recruiter && (
              <div className="font-medium" style={{ color: C.recruiter }}>
                {e.recruiter}
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {e.meetLink && (
                <a
                  href={e.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => ev.stopPropagation()}
                  className="rounded bg-[#1A73E8] px-1.5 py-0.5 font-semibold text-white"
                >
                  ▶ Google Meet
                </a>
              )}
              {e.candidateId && (
                <Link
                  href={`/candidates/${e.candidateId}`}
                  onClick={(ev) => ev.stopPropagation()}
                  className="rounded border border-line bg-white px-1.5 py-0.5 text-ink-soft hover:text-ink"
                >
                  Картка кандидата
                </Link>
              )}
            </div>

            {editing ? (
              <div className="space-y-1 pt-1">
                <textarea
                  autoFocus
                  value={text}
                  onChange={(ev) => setText(ev.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="Нотатка про кандидата…"
                  className="w-full rounded-md border border-field-line bg-field px-1.5 py-1 text-[12px] text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {msg?.error && <p className="text-danger">{msg.error}</p>}
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy || !text.trim()}
                    onClick={save}
                    className="rounded bg-accent px-2 py-1 font-semibold text-on-accent disabled:opacity-50"
                  >
                    {busy ? '…' : 'Зберегти'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setHover(false);
                      setText('');
                      setMsg(null);
                    }}
                    className="rounded border border-line px-2 py-1 text-ink-soft"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            ) : (
              e.candidateId && <div className="pt-1 text-ink-soft">Натисніть, щоб додати нотатку</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
