'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { ExternalLink, Phone, X } from 'lucide-react';
import { addQuickNote, loadCandidateQuick, type QuickCandidate, type QuickNote } from '@/app/(app)/pipeline/actions';

const WHEN = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
// Швидкі позначки дзвінка — один клік, і запис з часом іде в історію
const QUICK = ['📞 Не бере трубку', '📵 Немає зв’язку / поза зоною', '🔁 Просив передзвонити', '✅ Поговорили', '❌ Номер не існує'];

// Панель збоку: резюме кандидата і історія нотаток/дзвінків — без переходу в картку
export function CandidateQuickView({
  candidateId,
  applicationId,
  onClose,
  onNote,
}: {
  candidateId: string;
  applicationId: string | null;
  onClose: () => void;
  onNote?: (n: QuickNote) => void;
}) {
  const [data, setData] = useState<QuickCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    loadCandidateQuick(candidateId)
      .then((r) => {
        if (!alive) return;
        if (r.error) setError(r.error);
        else setData(r.data ?? null);
      })
      .catch(() => alive && setError('Не вдалося завантажити дані кандидата — спробуйте ще раз'));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      alive = false;
      window.removeEventListener('keydown', esc);
    };
  }, [candidateId, onClose]);

  const save = (body: string) =>
    start(async () => {
      const r = await addQuickNote(candidateId, applicationId, body);
      if (r.error || !r.note) return setError(r.error ?? 'Не вдалося зберегти');
      setError(null);
      setText('');
      setData((d) => (d ? { ...d, notes: [r.note!, ...d.notes] } : d));
      onNote?.(r.note);
    });

  const r = data?.resume;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Резюме і нотатки кандидата"
        className="flex h-full w-full max-w-[1200px] flex-col bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{data?.full_name ?? 'Завантаження…'}</p>
            {data && <p className="truncate text-sm text-ink-soft">{[data.current_position, data.city, data.email].filter(Boolean).join(' · ')}</p>}
          </div>
          {data?.phone && (
            <a href={`tel:${data.phone.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-strong">
              <Phone className="h-4 w-4" aria-hidden /> {data.phone}
            </a>
          )}
          <Link href={`/candidates/${candidateId}`} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-panel" title="Відкрити картку">
            <ExternalLink className="h-4 w-4" aria-hidden /> Картка
          </Link>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-panel" aria-label="Закрити">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_22rem] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <section className="flex h-[75vh] min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-card lg:h-full">
            {r && (
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-soft">
                <span className="truncate">Резюме{data && data.resumes > 1 ? ` (останнє з ${data.resumes})` : ''}</span>
                <a href={`/api/documents/${r.id}`} target="_blank" rel="noopener" className="shrink-0 underline hover:text-ink">
                  Оригінал файлу ↗
                </a>
              </div>
            )}
            {!data && !error && <p className="p-6 text-sm text-ink-soft">Завантажуємо резюме…</p>}
            {!data && error && <p className="p-6 text-sm text-danger">{error}</p>}
            {data && !r && <p className="p-6 text-sm text-ink-soft">У кандидата ще немає резюме.</p>}
            {r?.kind === 'iframe' && <iframe src={r.src} title={r.name} className="w-full flex-1" />}
            {r?.kind === 'img' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.src} alt={r.name} className="min-h-0 w-full flex-1 object-contain" />
            )}
            {r?.kind === 'html' && (
              <div
                className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:my-2 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_td]:align-top"
                // HTML очищено на сервері: лише базові теги без атрибутів, текст екрановано
                dangerouslySetInnerHTML={{ __html: r.html }}
              />
            )}
            {r?.kind === 'none' && (
              <p className="p-6 text-sm text-ink-soft">
                Файл .{r.ext} не відкривається в перегляді.{' '}
                <a href={`/api/documents/${r.id}?download=1`} className="underline">
                  Завантажити
                </a>
              </p>
            )}
          </section>

          <aside className="flex min-h-0 flex-col gap-3 rounded-2xl bg-white p-4 shadow-card">
            <h2 className="font-bold">Нотатки і дзвінки</h2>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={busy || !data}
                  onClick={() => save(q)}
                  className="rounded-full border border-field-line bg-field px-2.5 py-1 text-xs hover:bg-accent-soft disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Що з’ясували під час розмови…"
              className="w-full rounded-xl border border-field-line bg-field px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              disabled={busy || !text.trim() || !data}
              onClick={() => save(text)}
              className="self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {busy ? 'Зберігаємо…' : 'Додати нотатку'}
            </button>
            {error && <p className="text-sm text-danger">{error}</p>}
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {data?.notes.length === 0 && <li className="text-sm text-ink-soft">Нотаток ще немає.</li>}
              {data?.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-panel px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap break-words">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {WHEN.format(new Date(n.created_at))}
                    {n.author ? ` · ${n.author}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
