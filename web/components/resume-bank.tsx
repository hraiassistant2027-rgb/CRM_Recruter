'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addFromBank, searchResumeBank, type BankResult } from '@/app/(app)/resume-bank/actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { BankFilters } from '@/lib/drive';

const EMPTY: BankFilters = { text: '', position: '', city: '', skills: '', name: '', type: '', since: '', until: '' };

const TYPE_LABEL = (m: string) =>
  m === 'application/pdf' ? 'PDF' : m.includes('word') || m.includes('google-apps.document') ? 'Word' : m.startsWith('image/') ? 'Скан' : m.includes('rtf') ? 'RTF' : 'Файл';

export function ResumeBank({ vacancies, canAdd }: { vacancies: { id: string; title: string }[]; canAdd: boolean }) {
  const [filters, setFilters] = useState<BankFilters>(EMPTY);
  const [results, setResults] = useState<BankResult[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BankResult | null>(null);
  const [vacancyId, setVacancyId] = useState('');
  const [added, setAdded] = useState<Record<string, { ok: boolean; text: string; candidateId?: string }>>({});
  const [busy, start] = useTransition();
  const [adding, startAdd] = useTransition();
  const set = (k: keyof BankFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value });

  function run(more = false) {
    setError(null);
    start(async () => {
      const r = await searchResumeBank(filters, more ? next : null);
      if (r.error) {
        setError(r.error);
        return;
      }
      setResults(more ? [...(results ?? []), ...(r.files ?? [])] : r.files ?? []);
      setNext(r.next ?? null);
      if (!more) setPreview(null);
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(false);
        }}
      >
        <div className="md:col-span-2">
          <Field label="Будь-які слова з резюме" htmlFor="b-text">
            <Input id="b-text" value={filters.text} onChange={set('text')} placeholder="монолітні роботи, ПЦБ, бригадир…" />
          </Field>
        </div>
        <Field label="Посада" htmlFor="b-pos">
          <Input id="b-pos" value={filters.position} onChange={set('position')} placeholder="прораб" />
        </Field>
        <Field label="Місто" htmlFor="b-city">
          <Input id="b-city" value={filters.city} onChange={set('city')} placeholder="Київ" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Навички (через кому)" htmlFor="b-skills">
            <Input id="b-skills" value={filters.skills} onChange={set('skills')} placeholder="AutoCAD, кошторис" />
          </Field>
        </div>
        <Field label="Назва файлу містить" htmlFor="b-name">
          <Input id="b-name" value={filters.name} onChange={set('name')} placeholder="Іваненко" />
        </Field>
        <Field label="Тип файлу" htmlFor="b-type">
          <Select id="b-type" value={filters.type} onChange={set('type')}>
            <option value="">Усі</option>
            <option value="pdf">PDF</option>
            <option value="word">Word / Google Документ</option>
            <option value="image">Скан / фото</option>
          </Select>
        </Field>
        <Field label="Змінено з" htmlFor="b-since">
          <Input id="b-since" type="date" value={filters.since} onChange={set('since')} />
        </Field>
        <Field label="по" htmlFor="b-until">
          <Input id="b-until" type="date" value={filters.until} onChange={set('until')} />
        </Field>
        <div className="flex items-end gap-2 md:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy && !results ? 'Шукаємо…' : 'Знайти'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setFilters(EMPTY); setResults(null); setNext(null); setPreview(null); }}>
            Очистити
          </Button>
        </div>
      </form>

      {error && <Alert>{error}</Alert>}

      {results && (
        <div className={preview ? 'grid gap-4 xl:grid-cols-2' : ''}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-soft">
                {results.length === 0 ? 'Нічого не знайдено. Спробуйте менше слів або інше написання.' : `Знайдено: ${results.length}${next ? '+' : ''}`}
              </span>
              {canAdd && results.length > 0 && (
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-ink-soft">Додавати одразу у вакансію:</span>
                  <Select value={vacancyId} onChange={(e) => setVacancyId(e.target.value)} className="max-w-64 text-xs">
                    <option value="">— лише в базу —</option>
                    {vacancies.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {results.map((f) => {
                const state = added[f.id];
                const candidateId = state?.candidateId ?? f.candidateId;
                return (
                  <li key={f.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm ${preview?.id === f.id ? 'bg-accent-soft/40' : ''}`}>
                    <span className="w-12 shrink-0 rounded bg-surface px-1.5 py-0.5 text-center text-[11px] text-ink-soft">{TYPE_LABEL(f.mimeType)}</span>
                    <button type="button" onClick={() => setPreview(f)} className="min-w-0 flex-1 truncate text-left font-medium hover:underline" title={f.name}>
                      {f.name}
                    </button>
                    <span className="text-xs text-ink-soft">{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('uk-UA') : ''}</span>
                    {candidateId ? (
                      <Link href={`/candidates/${candidateId}`} className="text-xs text-ok underline">
                        у базі → картка
                      </Link>
                    ) : canAdd ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={adding}
                        onClick={() =>
                          startAdd(async () => {
                            const r = await addFromBank(f.id, vacancyId || null);
                            setAdded((a) => ({ ...a, [f.id]: { ok: r.status !== 'error', text: r.message, candidateId: r.candidateId } }));
                          })
                        }
                      >
                        Додати в базу
                      </Button>
                    ) : null}
                    {state && !state.ok && <span className="w-full text-xs text-danger">{state.text}</span>}
                    {state?.ok && <span className="w-full text-xs text-ink-soft">{state.text}</span>}
                  </li>
                );
              })}
            </ul>
            {next && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => run(true)}>
                {busy ? 'Завантажуємо…' : 'Показати ще'}
              </Button>
            )}
          </div>

          {preview && (
            <aside className="xl:sticky xl:top-4 xl:self-start">
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-sm">
                  <span className="truncate font-medium">{preview.name}</span>
                  <span className="flex shrink-0 gap-3">
                    {preview.webViewLink && (
                      <a href={preview.webViewLink} target="_blank" rel="noopener noreferrer" className="underline">
                        Відкрити в Диску
                      </a>
                    )}
                    <button type="button" onClick={() => setPreview(null)} className="underline">
                      Закрити
                    </button>
                  </span>
                </div>
                <iframe src={`https://drive.google.com/file/d/${preview.id}/preview`} title={preview.name} className="h-[80vh] w-full" allow="autoplay" />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
