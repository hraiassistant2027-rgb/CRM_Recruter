'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Monitor, Send } from 'lucide-react';
import { saveItRequest, sendItRequest, type ItFields } from '@/app/(app)/it/actions';
import { Badge, Button, Input } from '@/components/ui';

export type ItRow = {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  vacancyTitle: string;
  phone: string | null;
  offerAt: string | null;
  fields: ItFields;
  sent: string | null; // «26 лист., 14:05 → it@…»
  canEdit: boolean;
};

const PC_TYPES = ['Ноутбук', 'Стаціонарний ПК', 'Моноблок', 'Не потрібен'];

function Row({ row, canSend }: { row: ItRow; canSend: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<ItFields>(row.fields);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const set = (k: keyof ItFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const ro = !row.canEdit || busy;
  const id = (k: string) => `it-${k}-${row.applicationId}`;

  return (
    <li className="py-4 first:pt-1">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
        <Link href={`/candidates/${row.candidateId}`} className="font-semibold hover:underline">{row.candidateName}</Link>
        <span className="text-xs text-ink-soft">{row.vacancyTitle}{row.phone ? ` · ${row.phone}` : ''}</span>
        <span className="ml-auto">
          {row.sent ? <Badge tone="ok">надіслано в IT {row.sent}</Badge> : <Badge tone="danger">ще не надіслано в IT</Badge>}
        </span>
      </div>
      <dl className="mb-3 grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl bg-panel px-4 py-3 text-xs">
        <dt className="text-ink-soft">Дата оформлення:</dt>
        <dd className={row.offerAt ? 'font-medium text-ok' : 'text-ink-soft'}>{row.offerAt ?? 'не призначено'}</dd>
        <dt className="text-ink-soft">Посада:</dt>
        <dd>{row.vacancyTitle}</dd>
        <dt className="text-ink-soft">Телефон кандидата:</dt>
        <dd>{row.phone ?? '—'}</dd>
      </dl>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block text-ink-soft">Тип робочого ПК</span>
          <Input id={id('pc')} list={`pc-types-${row.applicationId}`} value={f.pc_type} onChange={set('pc_type')} disabled={ro} placeholder="Ноутбук" />
          <datalist id={`pc-types-${row.applicationId}`}>
            {PC_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-soft">В яку компанію оформлений</span>
          <Input id={id('company')} value={f.company} onChange={set('company')} disabled={ro} placeholder="Назва юрособи" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-soft">Кабінет (робоче місце)</span>
          <Input id={id('room')} value={f.room} onChange={set('room')} disabled={ro} placeholder="Каб. 204, офіс на Лесі Українки" />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-soft">Безпосередній керівник</span>
          <Input id={id('manager')} value={f.manager} onChange={set('manager')} disabled={ro} placeholder="ПІБ керівника" />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="mb-1 block text-ink-soft">Доступи (про доступи та характеристики запитати у безпосереднього керівника)</span>
          <textarea
            id={id('access')}
            rows={2}
            value={f.accesses}
            onChange={set('accesses')}
            disabled={ro}
            placeholder="1С, корпоративна пошта, AutoCAD, доступ до папки «Кошториси»…"
            className="block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/70 focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-70"
          />
        </label>
      </div>
      {row.canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy || !canSend}
            onClick={() =>
              start(async () => {
                const r = await sendItRequest(row.applicationId, f);
                setMsg(r);
                if (!r.error) router.refresh();
              })
            }
          >
            <Send className="h-4 w-4" aria-hidden /> {busy ? 'Надсилаємо…' : row.sent ? 'Надіслати оновлення в IT' : 'Надіслати в IT'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await saveItRequest(row.applicationId, f);
                setMsg(r);
              })
            }
          >
            Зберегти чернетку
          </Button>
          {msg?.error && <span className="text-sm text-danger">{msg.error}</span>}
          {msg?.ok && <span className="text-sm text-ok">{msg.ok}</span>}
        </div>
      )}
    </li>
  );
}

export function ItPrepList({ rows, itEmails, canSend, gmailReady }: { rows: ItRow[]; itEmails: string[]; canSend: boolean; gmailReady: boolean }) {
  return (
    <div>
      <p className="mb-3 flex items-start gap-2 rounded-2xl bg-soft px-4 py-2.5 text-xs text-ink-soft">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden />
        {itEmails.length ? (
          <span>
            Лист автоматично піде на: <b className="text-ink">{itEmails.join(', ')}</b>
          </span>
        ) : (
          <span>
            Адресу IT ще не вказано — адміністратор додає її в <Link href="/settings/dictionaries" className="underline">Налаштування → Довідники → Системні адміністратори (IT)</Link>.
          </span>
        )}
      </p>
      {!gmailReady && canSend && (
        <p className="mb-3 text-xs text-danger">
          Щоб надсилати листи, підключіть Google у <Link href="/profile" className="underline">Профілі</Link>.
        </p>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <Row key={r.applicationId} row={r} canSend={canSend && gmailReady && itEmails.length > 0} />
        ))}
      </ul>
    </div>
  );
}
