'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { prepareHrHandoff, sendHrHandoff, setHrStatus } from '@/app/(app)/hr/actions';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import { InfoStrip, PairPager } from '@/components/pair-pager';

export type HandoffRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  vacancyTitle: string;
  phone: string | null;
  offerAt: string | null; // уже відформатовано
  lastHandoff: string | null; // "25 лист., кому"
  docs: 'pending' | 'passed';
  approval: 'pending' | 'signed';
  polygraph: string; // «пройдено», «заплановано на …», «не призначено»
  canEdit: boolean;
};

function Row({
  row,
  contacts,
  canSend,
  selected,
  onSelect,
}: {
  row: HandoffRow;
  contacts: { id: string; name: string; email: string }[];
  canSend: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const [hrId, setHrId] = useState('');
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <div
      onClickCapture={onSelect}
      onFocusCapture={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`-mx-2 flex h-full cursor-pointer flex-col justify-center rounded-2xl px-2 text-sm transition-colors ${selected ? 'bg-soft ring-2 ring-accent/40' : 'hover:bg-panel'}`}
    >
      <div className="grid gap-3 px-1 md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-x-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/candidates/${row.candidateId}`} className="font-semibold hover:underline">
              {row.candidateName}
            </Link>
            <span className="truncate text-xs text-ink-soft">
              {row.vacancyTitle}
              {row.phone ? ` · ${row.phone}` : ''}
            </span>
          </div>
          <div>
            <Badge tone={row.offerAt ? 'ok' : 'warn'}>{row.offerAt ? `оформлення: ${row.offerAt}` : 'дату оформлення не призначено'}</Badge>
          </div>
          <div>
            {row.lastHandoff ? <Badge tone="neutral">передано {row.lastHandoff}</Badge> : <Badge tone="danger">не передано кадровику</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="text-ink-soft">Перевірка документів:</span>
          <select
            aria-label="Перевірка документів"
            defaultValue={row.docs}
            disabled={!row.canEdit || busy}
            onChange={(e) => start(async () => { const r = await setHrStatus(row.applicationId, 'hr_docs_status', e.target.value); if (r.error) setMsg(r); else router.refresh(); })}
            className={`w-full rounded-lg border border-field-line bg-field px-1.5 py-1 ${row.docs === 'passed' ? 'text-ok' : ''}`}
          >
            <option value="pending">очікую</option>
            <option value="passed">пройдено</option>
          </select>
          <span className="text-ink-soft">Поліграф:</span>
          <span className={row.polygraph === 'пройдено' ? 'text-ok' : ''}>{row.polygraph}</span>
          <span className="text-ink-soft">Лист погодження:</span>
          <select
            aria-label="Лист погодження"
            defaultValue={row.approval}
            disabled={!row.canEdit || busy}
            onChange={(e) => start(async () => { const r = await setHrStatus(row.applicationId, 'hr_approval_status', e.target.value); if (r.error) setMsg(r); else router.refresh(); })}
            className={`w-full rounded-lg border border-field-line bg-field px-1.5 py-1 ${row.approval === 'signed' ? 'text-ok' : ''}`}
          >
            <option value="pending">очікую підписання</option>
            <option value="signed">підписано</option>
          </select>
        </div>
      </div>
      {canSend && (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
          <Select value={hrId} onChange={(e) => { setHrId(e.target.value); setDraft(null); setMsg(null); }} aria-label="Кадровик" className="max-w-xs">
            <option value="">Оберіть кадровика…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.email}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            disabled={!hrId || busy}
            onClick={() =>
              start(async () => {
                const r = await prepareHrHandoff(row.applicationId, hrId);
                if (r.error) setMsg({ error: r.error });
                else setDraft({ to: r.to!, subject: r.subject!, body: r.body! });
              })
            }
          >
            Підготувати лист
          </Button>
        </div>
      )}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label={`Лист кадровику: ${row.candidateName}`}>
        <div className="w-full max-w-2xl space-y-2 rounded-3xl bg-white p-6 shadow-card">
          <h3 className="text-lg font-bold">Лист кадровику — {row.candidateName}</h3>
          <p className="text-xs text-ink-soft">
            Кому: <strong>{draft.to}</strong>
          </p>
          <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} aria-label="Тема" />
          <textarea
            value={draft.body}
            rows={Math.min(18, draft.body.split('\n').length + 1)}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            aria-label="Текст листа"
            className="block w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  const r = await sendHrHandoff({ applicationId: row.applicationId, hrContactId: hrId, subject: draft.subject, body: draft.body });
                  setMsg(r);
                  if (r.ok) {
                    setDraft(null);
                    router.refresh();
                  }
                })
              }
            >
              {busy ? 'Надсилаємо…' : 'Надіслати кадровику'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
              Скасувати
            </Button>
          </div>
          {msg?.error && <Alert>{msg.error}</Alert>}
        </div>
        </div>
      )}
      {!draft && msg?.error && <p className="mt-1 truncate px-1 text-xs text-danger" title={msg.error}>{msg.error}</p>}
      {!draft && msg?.ok && <p className="mt-1 truncate px-1 text-xs text-ok">{msg.ok}</p>}
    </div>
  );
}

export function HrHandoffList({
  rows,
  contacts,
  canSend,
  gmailReady,
  selectedId,
  onSelect,
}: {
  rows: HandoffRow[];
  contacts: { id: string; name: string; email: string }[];
  canSend: boolean;
  gmailReady: boolean;
  selectedId?: string | null;
  onSelect?: (applicationId: string) => void;
}) {
  return (
    <div>
      {canSend && !gmailReady ? (
        <InfoStrip tone="warn">
          Щоб надсилати лист кадровику, підключіть Google у <Link href="/profile" className="underline">профілі</Link>.
        </InfoStrip>
      ) : canSend && contacts.length === 0 ? (
        <InfoStrip tone="warn">Кадровиків ще не додано: Налаштування → Довідники → Кадровики.</InfoStrip>
      ) : (
        <InfoStrip>Оберіть кандидата — праворуч відкриється його заявка для IT</InfoStrip>
      )}
      <PairPager
        label="Кандидати на оформлення"
        slotClass="h-[14.5rem] py-2"
        onPageChange={(i) => rows[i] && onSelect?.(rows[i].applicationId)}
        items={rows.map((r) => (
          <Row
            key={r.applicationId}
            row={r}
            contacts={contacts}
            canSend={canSend && gmailReady}
            selected={r.applicationId === selectedId}
            onSelect={() => onSelect?.(r.applicationId)}
          />
        ))}
      />
    </div>
  );
}
