'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Monitor, Send } from 'lucide-react';
import { saveItRequest, sendItRequest, type ItFields } from '@/app/(app)/it/actions';
import { Badge, Button } from '@/components/ui';
import { InfoStrip, PairPager } from '@/components/pair-pager';

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

  const small =
    'block h-8 w-full rounded-lg border border-field-line bg-field px-2.5 text-xs text-ink placeholder:text-ink-soft/60 focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-70';
  const label = 'mb-0.5 block truncate text-[10px] font-medium uppercase tracking-wide text-ink-soft';

  return (
    <div className="flex h-full flex-col gap-2 px-1 text-sm">
      <div className="flex items-baseline gap-2">
        <Link href={`/candidates/${row.candidateId}`} className="shrink-0 font-semibold hover:underline">{row.candidateName}</Link>
        <span className="min-w-0 truncate text-xs text-ink-soft">{row.vacancyTitle}{row.phone ? ` · ${row.phone}` : ''}</span>
        <span className="ml-auto shrink-0">
          {row.sent ? <Badge tone="ok">надіслано в IT</Badge> : <Badge tone="danger">не надіслано в IT</Badge>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={row.offerAt ? 'ok' : 'warn'}>{row.offerAt ? `оформлення: ${row.offerAt}` : 'дату оформлення не призначено'}</Badge>
        {row.sent && <span className="truncate text-ink-soft" title={row.sent}>{row.sent}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="min-w-0">
          <span className={label}>Тип робочого ПК</span>
          <input id={id('pc')} list={`pc-types-${row.applicationId}`} value={f.pc_type} onChange={set('pc_type')} disabled={ro} placeholder="Ноутбук" className={small} />
          <datalist id={`pc-types-${row.applicationId}`}>
            {PC_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="min-w-0">
          <span className={label}>Компанія оформлення</span>
          <input id={id('company')} value={f.company} onChange={set('company')} disabled={ro} placeholder="Юрособа" className={small} />
        </label>
        <label className="min-w-0">
          <span className={label}>Кабінет (робоче місце)</span>
          <input id={id('room')} value={f.room} onChange={set('room')} disabled={ro} placeholder="Каб. 204" className={small} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="min-w-0">
          <span className={label}>Безпосередній керівник</span>
          <input id={id('manager')} value={f.manager} onChange={set('manager')} disabled={ro} placeholder="ПІБ керівника" className={small} />
        </label>
        <label className="col-span-2 min-w-0">
          <span className={label} title="Про доступи та характеристики запитати у безпосереднього керівника">Доступи (уточнити у керівника)</span>
          <input id={id('access')} value={f.accesses} onChange={set('accesses')} disabled={ro} placeholder="1С, пошта, AutoCAD, папка «Кошториси»…" className={small} />
        </label>
      </div>
      {row.canEdit && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="!px-3 !py-1.5 text-xs"
            disabled={busy || !canSend}
            onClick={() =>
              start(async () => {
                const r = await sendItRequest(row.applicationId, f);
                setMsg(r);
                if (!r.error) router.refresh();
              })
            }
          >
            <Send className="h-3.5 w-3.5" aria-hidden /> {busy ? 'Надсилаємо…' : row.sent ? 'Надіслати оновлення' : 'Надіслати в IT'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await saveItRequest(row.applicationId, f);
                setMsg(r);
              })
            }
          >
            Зберегти
          </Button>
          {msg?.error && <span className="min-w-0 truncate text-xs text-danger" title={msg.error}>{msg.error}</span>}
          {msg?.ok && <span className="min-w-0 truncate text-xs text-ok" title={msg.ok}>{msg.ok}</span>}
        </div>
      )}
    </div>
  );
}

export function ItPrepList({ rows, itEmails, canSend, gmailReady }: { rows: ItRow[]; itEmails: string[]; canSend: boolean; gmailReady: boolean }) {
  return (
    <div>
      {!itEmails.length ? (
        <InfoStrip tone="warn">
          <Monitor className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            Адресу IT не вказано: <Link href="/settings/dictionaries" className="underline">Довідники → Системні адміністратори (IT)</Link>
          </span>
        </InfoStrip>
      ) : !gmailReady && canSend ? (
        <InfoStrip tone="warn">
          Щоб надсилати листи, підключіть Google у <Link href="/profile" className="underline">Профілі</Link>.
        </InfoStrip>
      ) : (
        <InfoStrip>
          <Monitor className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden />
          <span className="truncate" title={itEmails.join(', ')}>
            Лист автоматично піде на: <b className="text-ink">{itEmails.join(', ')}</b>
          </span>
        </InfoStrip>
      )}
      <PairPager
        label="Підготовка робочого місця IT"
        slotClass="h-[14.5rem] py-3"
        items={rows.map((r) => (
          <Row key={r.applicationId} row={r} canSend={canSend && gmailReady && itEmails.length > 0} />
        ))}
      />
    </div>
  );
}
