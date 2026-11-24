'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { moveApplication } from '@/app/(app)/vacancies/actions';
import { Alert, Button, Field, Select } from '@/components/ui';
import { daysOnStage, type BoardCard, type Stage } from '@/lib/vacancies';

type Reason = { id: string; name: string; side: 'company' | 'candidate' };
type Pending = { card: BoardCard; stage: Stage } | null;

const CLOSED = ['rejected', 'withdrawn'];

export function PipelineBoard({
  stages,
  cards: initialCards,
  reasons,
  canMove,
}: {
  stages: Stage[];
  cards: BoardCard[];
  reasons: Reason[];
  canMove: boolean;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, startTransition] = useTransition();

  useEffect(() => setCards(initialCards), [initialCards]);

  const visibleStages = stages.filter((s) => showClosed || !CLOSED.includes(s.kind));
  const closedCount = cards.filter((c) => CLOSED.includes(stages.find((s) => s.id === c.stage_id)?.kind ?? '')).length;

  function requestMove(card: BoardCard, stage: Stage) {
    if (card.stage_id === stage.id) return;
    if (CLOSED.includes(stage.kind)) {
      setPending({ card, stage });
      return;
    }
    doMove(card, stage, null, null);
  }

  function doMove(card: BoardCard, stage: Stage, reasonId: string | null, comment: string | null) {
    setError(null);
    const before = cards;
    setCards((list) =>
      list.map((c) => (c.id === card.id ? { ...c, stage_id: stage.id, stage_changed_at: new Date().toISOString() } : c)),
    );
    startTransition(async () => {
      const result = await moveApplication({ applicationId: card.id, stageId: stage.id, reasonId, comment });
      if (result.error) {
        setCards(before);
        setError(`${card.full_name}: ${result.error}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-ink-soft">
          {canMove ? 'Перетягніть картку на інший етап або скористайтеся списком «Етап» на картці.' : 'Перегляд воронки (без права змінювати етапи).'}
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-[var(--color-accent-strong)]" />
          Показати відмови ({closedCount})
        </label>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {visibleStages.map((stage) => {
            const list = cards.filter((c) => c.stage_id === stage.id);
            return (
              <section
                key={stage.id}
                aria-label={stage.name}
                onDragOver={(e) => {
                  if (!canMove || !dragId) return;
                  e.preventDefault();
                  setOverStage(stage.id);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const card = cards.find((c) => c.id === dragId);
                  setDragId(null);
                  if (card) requestMove(card, stage);
                }}
                className={`flex w-60 shrink-0 flex-col rounded-xl border bg-surface/60 ${overStage === stage.id ? 'border-accent-strong ring-2 ring-accent/40' : 'border-line'}`}
              >
                <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} aria-hidden />
                  <h3 className="truncate text-sm font-medium" title={stage.name}>
                    {stage.name}
                  </h3>
                  <span className="ml-auto rounded-full bg-white px-2 text-xs text-ink-soft">{list.length}</span>
                </header>
                <ul className="flex min-h-24 flex-col gap-2 p-2">
                  {list.map((card) => {
                    const days = daysOnStage(card.stage_changed_at);
                    const overdue = stage.sla_days != null && days > stage.sla_days && !CLOSED.includes(stage.kind) && stage.kind !== 'hired';
                    return (
                      <li
                        key={card.id}
                        draggable={canMove && !busy}
                        onDragStart={(e) => {
                          setDragId(card.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDragId(null)}
                        className={`rounded-lg border bg-white p-3 text-sm shadow-sm ${canMove ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === card.id ? 'opacity-50' : ''} ${overdue ? 'border-danger/40' : 'border-line'}`}
                      >
                        <Link href={`/candidates/${card.candidate_id}`} className="font-medium hover:underline">
                          {card.full_name}
                        </Link>
                        {(card.current_position || card.city) && (
                          <div className="mt-0.5 truncate text-xs text-ink-soft">{[card.current_position, card.city].filter(Boolean).join(' · ')}</div>
                        )}
                        {card.rejection_reason && <div className="mt-1 text-xs text-danger">{card.rejection_reason}</div>}
                        <div className={`mt-2 text-xs ${overdue ? 'font-medium text-danger' : 'text-ink-soft'}`}>
                          {days === 0 ? 'сьогодні' : `${days} дн. на етапі`}
                          {overdue ? ` (норма ${stage.sla_days})` : ''}
                        </div>
                        {canMove && (
                          <label className="mt-2 block">
                            <span className="sr-only">Етап</span>
                            <select
                              value={card.stage_id}
                              disabled={busy}
                              onChange={(e) => {
                                const target = stages.find((s) => s.id === e.target.value);
                                if (target) requestMove(card, target);
                              }}
                              className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs"
                            >
                              {stages.map((s) => (
                                <option key={s.id} value={s.id}>
                                  Етап: {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {pending && (
        <RejectDialog
          pending={pending}
          reasons={reasons.filter((r) => r.side === (pending.stage.kind === 'withdrawn' ? 'candidate' : 'company'))}
          onCancel={() => setPending(null)}
          onConfirm={(reasonId, comment) => {
            const p = pending;
            setPending(null);
            doMove(p.card, p.stage, reasonId, comment);
          }}
        />
      )}
    </div>
  );
}

function RejectDialog({
  pending,
  reasons,
  onCancel,
  onConfirm,
}: {
  pending: NonNullable<Pending>;
  reasons: Reason[];
  onCancel: () => void;
  onConfirm: (reasonId: string, comment: string) => void;
}) {
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? '');
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-title">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="reject-title" className="mb-1 text-lg font-semibold">
          {pending.stage.name}
        </h2>
        <p className="mb-4 text-sm text-ink-soft">{pending.card.full_name}</p>
        <div className="space-y-4">
          <Field label="Причина *" htmlFor="reason">
            <Select id="reason" value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Коментар" htmlFor="reject-comment">
            <textarea
              id="reject-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="block w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Скасувати
          </Button>
          <Button type="button" disabled={!reasonId} onClick={() => onConfirm(reasonId, comment)}>
            Підтвердити
          </Button>
        </div>
      </div>
    </div>
  );
}
