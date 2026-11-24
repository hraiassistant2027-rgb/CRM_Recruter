'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { prepareHrHandoff, sendHrHandoff } from '@/app/(app)/hr/actions';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';

export type HandoffRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  vacancyTitle: string;
  phone: string | null;
  offerAt: string | null; // уже відформатовано
  lastHandoff: string | null; // "25 лист., кому"
};

function Row({ row, contacts, canSend }: { row: HandoffRow; contacts: { id: string; name: string; email: string }[]; canSend: boolean }) {
  const router = useRouter();
  const [hrId, setHrId] = useState('');
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <li className={`py-3 text-sm ${row.lastHandoff ? '' : 'bg-accent-soft/30'}`}>
      <div className="flex flex-wrap items-center gap-2 px-2">
        <Link href={`/candidates/${row.candidateId}`} className="font-medium hover:underline">
          {row.candidateName}
        </Link>
        <span className="text-xs text-ink-soft">
          {row.vacancyTitle}
          {row.phone ? ` · ${row.phone}` : ''}
        </span>
        <Badge tone={row.offerAt ? 'ok' : 'warn'}>{row.offerAt ? `оформлення: ${row.offerAt}` : 'дату оформлення не призначено'}</Badge>
        {row.lastHandoff ? <Badge tone="neutral">передано {row.lastHandoff}</Badge> : <Badge tone="danger">не передано кадровику</Badge>}
      </div>
      {canSend && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-2">
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
        <div className="mx-2 mt-3 space-y-2 rounded-lg border border-line bg-white p-3">
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
        </div>
      )}
      {msg?.error && <div className="mx-2 mt-2"><Alert>{msg.error}</Alert></div>}
      {msg?.ok && <div className="mx-2 mt-2"><Alert kind="success">{msg.ok}</Alert></div>}
    </li>
  );
}

export function HrHandoffList({ rows, contacts, canSend, gmailReady }: { rows: HandoffRow[]; contacts: { id: string; name: string; email: string }[]; canSend: boolean; gmailReady: boolean }) {
  return (
    <div>
      {canSend && !gmailReady && (
        <p className="mb-2 text-xs text-ink-soft">
          Щоб надсилати лист кадровику, підключіть Google у{' '}
          <Link href="/profile" className="underline">
            профілі
          </Link>
          .
        </p>
      )}
      {canSend && contacts.length === 0 && (
        <p className="mb-2 text-xs text-ink-soft">
          Список кадровиків порожній — адміністратор додає їх у Налаштування → Довідники → Кадровики.
        </p>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <Row key={r.applicationId} row={r} contacts={contacts} canSend={canSend && gmailReady} />
        ))}
      </ul>
    </div>
  );
}
