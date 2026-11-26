'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Monitor, RotateCcw, Send } from 'lucide-react';
import { saveItRequest, sendItRequest, type ItFields } from '@/app/(app)/it/actions';
import { Badge, Button } from '@/components/ui';
import { InfoStrip } from '@/components/pair-pager';
import { latinName } from '@/lib/translit';

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
const field =
  'block w-full rounded-xl border border-field-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 transition-colors focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-70';
const label = 'mb-1 block text-xs font-medium text-ink-soft';

// Заявка IT для одного кандидата — того, якого обрано в блоці «Кандидати на оформлення»
export function ItCard({ row, position, total, canSend }: { row: ItRow; position: number; total: number; canSend: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<ItFields>({ ...row.fields, name_latin: row.fields.name_latin || latinName(row.candidateName) });
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const set = (k: keyof ItFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ro = !row.canEdit || busy;
  const id = (k: string) => `it-${k}-${row.applicationId}`;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
        <span>
          Кандидат {position} з {total}
        </span>
        {row.sent ? <Badge tone="ok">надіслано в IT</Badge> : <Badge tone="danger">ще не надіслано в IT</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <span className={label}>ПІБ кандидата</span>
          <Link href={`/candidates/${row.candidateId}`} className="block truncate rounded-xl bg-panel px-3 py-2 text-sm font-semibold hover:underline">
            {row.candidateName}
          </Link>
        </div>
        <label className="min-w-0" htmlFor={id('latin')}>
          <span className={label}>Прізвище та ім&apos;я латиницею</span>
          <span className="flex gap-1.5">
            <input id={id('latin')} value={f.name_latin} onChange={set('name_latin')} disabled={ro} placeholder="Zhohlo Dmytro" className={field} />
            <button
              type="button"
              title="Заповнити заново за правилами транслітерації"
              aria-label="Заповнити латиницею заново"
              disabled={ro}
              onClick={() => setF({ ...f, name_latin: latinName(row.candidateName) })}
              className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-panel text-ink-soft hover:text-ink disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </label>
      </div>

      <dl className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl bg-panel px-4 py-3 text-sm">
        <dt className="text-ink-soft">Дата оформлення:</dt>
        <dd className={row.offerAt ? 'font-semibold text-ok' : 'text-ink-soft'}>{row.offerAt ?? 'не призначено'}</dd>
        <dt className="text-ink-soft">Посада:</dt>
        <dd className="truncate">{row.vacancyTitle}</dd>
        <dt className="text-ink-soft">Телефон кандидата:</dt>
        <dd>{row.phone ?? '—'}</dd>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0" htmlFor={id('pc')}>
          <span className={label}>Тип робочого ПК</span>
          <input id={id('pc')} list={`pc-types-${row.applicationId}`} value={f.pc_type} onChange={set('pc_type')} disabled={ro} placeholder="Ноутбук" className={field} />
          <datalist id={`pc-types-${row.applicationId}`}>
            {PC_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="min-w-0" htmlFor={id('company')}>
          <span className={label}>В яку компанію оформлений</span>
          <input id={id('company')} value={f.company} onChange={set('company')} disabled={ro} placeholder="Юрособа" className={field} />
        </label>
        <label className="min-w-0" htmlFor={id('room')}>
          <span className={label}>Кабінет (робоче місце)</span>
          <input id={id('room')} value={f.room} onChange={set('room')} disabled={ro} placeholder="Каб. 204, офіс на Лесі Українки" className={field} />
        </label>
        <label className="min-w-0" htmlFor={id('manager')}>
          <span className={label}>Безпосередній керівник</span>
          <input id={id('manager')} value={f.manager} onChange={set('manager')} disabled={ro} placeholder="ПІБ керівника" className={field} />
        </label>
        <label className="min-w-0 sm:col-span-2" htmlFor={id('access')}>
          <span className={label}>Доступи — про доступи та характеристики запитати у безпосереднього керівника</span>
          <textarea id={id('access')} rows={2} value={f.accesses} onChange={set('accesses')} disabled={ro} placeholder="1С, корпоративна пошта, AutoCAD, папка «Кошториси»…" className={field} />
        </label>
      </div>

      {row.canEdit && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
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
            Зберегти
          </Button>
          {msg?.error && <span className="min-w-0 text-xs text-danger">{msg.error}</span>}
          {msg?.ok && <span className="min-w-0 truncate text-xs text-ok">{msg.ok}</span>}
          {!msg && row.sent && <span className="min-w-0 truncate text-xs text-ink-soft" title={row.sent}>{row.sent}</span>}
        </div>
      )}
    </div>
  );
}

export function ItInfo({ itEmails, canSend, gmailReady }: { itEmails: string[]; canSend: boolean; gmailReady: boolean }) {
  if (!itEmails.length) {
    return (
      <InfoStrip tone="warn">
        <Monitor className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">
          Адресу IT не вказано: <Link href="/settings/dictionaries" className="underline">Довідники → Системні адміністратори (IT)</Link>
        </span>
      </InfoStrip>
    );
  }
  if (!gmailReady && canSend) {
    return (
      <InfoStrip tone="warn">
        Щоб надсилати листи, підключіть Google у <Link href="/profile" className="underline">Профілі</Link>.
      </InfoStrip>
    );
  }
  return (
    <InfoStrip>
      <Monitor className="h-4 w-4 shrink-0 text-accent-strong" aria-hidden />
      <span className="truncate" title={itEmails.join(', ')}>
        Лист автоматично піде на: <b className="text-ink">{itEmails.join(', ')}</b>
      </span>
    </InfoStrip>
  );
}
