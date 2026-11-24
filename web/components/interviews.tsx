'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelInterview, rescheduleInterview, saveInterviewResult, scheduleInterview, syncInterviewResponses } from '@/app/(app)/calendar/actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { EmailComposer } from '@/components/email-composer';
import { KIND_LABELS } from '@/lib/interviews';
import { LocationPicker, type LocationValue, type Site } from '@/components/location-picker';

type Option = { id: string; name: string };
type Msg = { ok?: string; error?: string } | null;

function Message({ m }: { m: Msg }) {
  if (m?.error) return <Alert>{m.error}</Alert>;
  if (m?.ok) return <Alert kind="success">{m.ok}</Alert>;
  return null;
}

function tomorrow(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Призначення співбесіди
// ---------------------------------------------------------------------
export function ScheduleInterview({
  applications,
  users,
  candidateId,
  candidateEmail,
  fromEmail,
  templates,
  inviteTemplateId,
  sites = [],
  defaultSiteId = null,
}: {
  applications: Option[];
  users: Option[];
  candidateId: string;
  candidateEmail: string | null;
  fromEmail: string;
  templates: Option[];
  inviteTemplateId?: string;
  sites?: Site[];
  defaultSiteId?: string | null;
}) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [place, setPlace] = useState<LocationValue>({ mode: 'phone', location: 'Телефоном', meet: false });
  const [created, setCreated] = useState<{ interviewId: string; applicationId: string } | null>(null);
  const [writeLetter, setWriteLetter] = useState(false);

  if (created) {
    return (
      <div className="space-y-3">
        <Message m={msg} />
        {candidateEmail && !writeLetter && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setWriteLetter(true)}>
              Написати кандидату лист-запрошення
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setCreated(null); setMsg(null); }}>
              Готово
            </Button>
          </div>
        )}
        {writeLetter && candidateEmail && (
          <EmailComposer
            candidateId={candidateId}
            candidateEmail={candidateEmail}
            fromEmail={fromEmail}
            templates={templates}
            applications={applications}
            interviewId={created.interviewId}
            defaultTemplateId={inviteTemplateId}
            defaultApplicationId={created.applicationId}
          />
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await scheduleInterview(data);
          setMsg(r);
          if (r.ok && r.interviewId) {
            setCreated({ interviewId: r.interviewId, applicationId: String(data.get('application_id')) });
            if (place.meet) setWriteLetter(true); // онлайн — одразу пропонуємо лист із посиланням Meet
          }
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Вакансія" htmlFor="iv-app">
          <Select id="iv-app" name="application_id" defaultValue={applications[0]?.id}>
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Тип" htmlFor="iv-kind">
          <Select id="iv-kind" name="kind" defaultValue="phone">
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_100px_120px] gap-2 md:col-span-2">
          <Field label="Дата" htmlFor="iv-date">
            <Input id="iv-date" name="date" type="date" defaultValue={tomorrow()} />
          </Field>
          <Field label="Час" htmlFor="iv-time">
            <Input id="iv-time" name="time" type="time" defaultValue="10:00" step={300} />
          </Field>
          <Field label="Тривалість" htmlFor="iv-duration">
            <Select id="iv-duration" name="duration" defaultValue="30">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} хв
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="md:col-span-2">
          <input type="hidden" name="location" value={place.location} />
          {place.meet && <input type="hidden" name="meet" value="on" />}
          <LocationPicker sites={sites} defaultMode="phone" defaultSiteId={defaultSiteId} googleReady idPrefix="iv-loc" onChange={setPlace} />
        </div>
      </div>

      {users.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Учасники від компанії</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="participant_ids" value={u.id} className="accent-[var(--color-accent-strong)]" />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Інші учасники (email через кому)" htmlFor="iv-extra">
        <Input id="iv-extra" name="extra_emails" placeholder="manager@company.com" />
      </Field>
      <Field label="Нотатка в подію календаря" htmlFor="iv-note">
        <Input id="iv-note" name="note" placeholder="Що обговорити, які документи взяти" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="invite_candidate" defaultChecked={Boolean(candidateEmail)} disabled={!candidateEmail} className="accent-[var(--color-accent-strong)]" />
        Надіслати кандидату запрошення з календаря {candidateEmail ? `(${candidateEmail})` : '— немає email у картці'}
      </label>
      <Message m={msg} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Створюємо подію…' : 'Призначити співбесіду'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------
// Дії з призначеною співбесідою
// ---------------------------------------------------------------------
export function InterviewActions({
  id,
  status,
  date,
  time,
  duration,
  location,
  past,
}: {
  id: string;
  status: string;
  date: string;
  time: string;
  duration: number;
  location: string | null;
  past: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'move' | 'result'>('none');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();
  const active = status === 'scheduled' || status === 'rescheduled';

  const run = (fn: () => Promise<Msg>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) {
        setMode('none');
        router.refresh();
      }
    });

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        {active && (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setMode(mode === 'move' ? 'none' : 'move')}>
              Перенести
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!confirm('Скасувати співбесіду? Учасники отримають сповіщення з календаря.')) return;
                const d = new FormData();
                d.set('id', id);
                run(() => cancelInterview(d));
              }}
            >
              Скасувати
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => run(() => syncInterviewResponses(id))}>
              Оновити з календаря
            </Button>
          </>
        )}
        {(active && past) || status === 'done' || status === 'no_show' ? (
          <Button type="button" variant={active && past ? 'primary' : 'ghost'} disabled={busy} onClick={() => setMode(mode === 'result' ? 'none' : 'result')}>
            {status === 'done' || status === 'no_show' ? 'Змінити результат' : 'Внести результат'}
          </Button>
        ) : null}
      </div>

      {mode === 'move' && (
        <form
          className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_100px_110px]"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('id', id);
            run(() => rescheduleInterview(d));
          }}
        >
          <Input name="date" type="date" defaultValue={date} aria-label="Нова дата" />
          <Input name="time" type="time" defaultValue={time} step={300} aria-label="Новий час" />
          <Select name="duration" defaultValue={String(duration)} aria-label="Тривалість">
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} хв
              </option>
            ))}
          </Select>
          <Input name="location" defaultValue={location ?? ''} placeholder="Місце (якщо змінилось)" aria-label="Місце" className="sm:col-span-3" />
          <Button type="submit" disabled={busy} className="sm:col-span-3">
            {busy ? '…' : 'Зберегти новий час'}
          </Button>
        </form>
      )}

      {mode === 'result' && (
        <form
          className="space-y-2 rounded-lg border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('id', id);
            run(() => saveInterviewResult(d));
          }}
        >
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="status" value="done" defaultChecked={status !== 'no_show'} /> Відбулась
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="status" value="no_show" defaultChecked={status === 'no_show'} /> Кандидат не з’явився
            </label>
          </div>
          <Input name="result" placeholder="Підсумок: рекомендовано / не підходить / на розгляді" aria-label="Підсумок" />
          <textarea
            name="result_comment"
            rows={3}
            placeholder="Коментар: сильні сторони, сумніви, домовленості"
            aria-label="Коментар"
            className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={busy}>
            {busy ? '…' : 'Зберегти результат'}
          </Button>
          <p className="text-xs text-ink-soft">Щоб перевести кандидата на наступний етап, скористайтеся воронкою вакансії.</p>
        </form>
      )}
      <Message m={msg} />
    </div>
  );
}
