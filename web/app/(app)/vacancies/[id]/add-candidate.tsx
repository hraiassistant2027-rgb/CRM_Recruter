'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { addApplication, findCandidates } from '../actions';
import { Alert, Button, Input } from '@/components/ui';

type Found = { id: string; full_name: string; city: string | null; current_position: string | null };

export function AddCandidate({ vacancyId, canCreateCandidate }: { vacancyId: string; canCreateCandidate: boolean }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => startSearch(async () => setFound(await findCandidates(q))), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Почніть вводити ПІБ, телефон або навичку…"
        aria-label="Пошук кандидата в базі"
      />
      {searching && <p className="text-xs text-ink-soft">Шукаємо…</p>}
      {found.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {found.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.full_name}</span>
                <span className="block truncate text-xs text-ink-soft">{[c.current_position, c.city].filter(Boolean).join(' · ')}</span>
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={adding}
                onClick={() => {
                  const data = new FormData();
                  data.set('vacancy_id', vacancyId);
                  data.set('candidate_id', c.id);
                  startAdd(async () => {
                    const result = await addApplication({}, data);
                    setMessage(result);
                    if (result.ok) {
                      setQuery('');
                      setFound([]);
                    }
                  });
                }}
              >
                Додати
              </Button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && !searching && found.length === 0 && (
        <p className="text-sm text-ink-soft">
          Не знайдено.{' '}
          {canCreateCandidate && (
            <Link href="/candidates/new" className="underline">
              Створити нового кандидата
            </Link>
          )}
        </p>
      )}
      {message?.error && <Alert>{message.error}</Alert>}
      {message?.ok && <Alert kind="success">Додано: {message.ok}</Alert>}
    </div>
  );
}
