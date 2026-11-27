'use client';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCandidate, extractResumeFields, updateCandidate, type CandidateFormState } from './actions';
import { addApplication } from '../vacancies/actions';
import { FIELD_LABELS, type ResumeFields } from '@/lib/resume-parse';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { CustomFieldInputs } from '@/components/custom-field-inputs';
import type { FieldDef } from '@/lib/custom-fields';
import { LEGAL_BASIS_LABELS, MATCH_LABELS, type CandidateRow } from '@/lib/candidates';

type Source = { id: string; name: string };

const textareaClass =
  'block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent-strong focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent/15';

export function CandidateForm({
  sources,
  candidate,
  vacancyId,
  cancelHref,
  customFields = [],
}: {
  customFields?: FieldDef[];
  sources: Source[];
  candidate?: CandidateRow;
  vacancyId?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [dupMessage, setDupMessage] = useState<string | null>(null);
  const isEdit = Boolean(candidate);
  const [state, action] = useActionState<CandidateFormState, FormData>(isEdit ? updateCandidate : createCandidate, {});
  const confirmRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [parsing, startParsing] = useTransition();
  const [parseNote, setParseNote] = useState<{ kind: 'success' | 'info'; text: string; preview?: string[] } | null>(null);

  // Після вибору файлу резюме — розпізнаємо дані і заповнюємо лише порожні поля
  function onResumeChosen(input: HTMLInputElement) {
    const file = input.files?.[0];
    setParseNote(null);
    if (!file || !formRef.current) return;
    const data = new FormData();
    data.set('resume', file);
    startParsing(async () => {
      const result = await extractResumeFields(data);
      if (result.error && Object.keys(result.fields).length === 0) {
        setParseNote({ kind: 'info', text: result.error });
        return;
      }
      const form = formRef.current;
      if (!form) return;
      const filled: string[] = [];
      for (const [key, value] of Object.entries(result.fields) as [keyof ResumeFields, string][]) {
        const el = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
        if (!el || !value) continue;
        if (key === 'salary_currency') {
          if (result.fields.desired_salary) el.value = value;
          continue;
        }
        if (el.value.trim() === '') {
          el.value = value;
          filled.push(FIELD_LABELS[key]);
        }
      }
      const noName = !result.fields.full_name;
      const base = filled.length
        ? `З резюме заповнено: ${filled.join(', ')}.${noName ? ' ПІБ не розпізнано — впишіть вручну.' : ''} Перевірте дані перед збереженням. Досвід роботи, освіту й навички система додасть у картку після збереження.`
        : 'Нових даних у резюме не знайдено — заповніть поля вручну.';
      setParseNote({
        kind: filled.length && !noName && !result.error ? 'success' : 'info',
        text: result.error ? `${result.error} ${filled.length ? `Заповнено: ${filled.join(', ')}.` : ''}` : base,
        preview: result.preview,
      });
    });
  }
  const fe = state.fieldErrors ?? {};
  const c = candidate;

  return (
    // Відправка вручну (а не через action=), щоб React не очищав поля форми,
    // коли треба показати помилки або знайдені дублікати
    <form
      ref={formRef}
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (confirmRef.current) confirmRef.current.value = 'no';
        startTransition(() => action(data));
      }}
    >
      {c && <input type="hidden" name="id" value={c.id} />}
      {vacancyId && <input type="hidden" name="vacancy_id" value={vacancyId} />}
      <input ref={confirmRef} type="hidden" name="confirm_duplicates" value="no" />

      {state.duplicates && state.duplicates.length > 0 && (
        <div className="rounded-xl border border-accent/60 bg-accent-soft p-4">
          <h3 className="font-medium">Схоже, такий кандидат уже є в базі</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {state.duplicates.map((d) => (
              <li key={d.candidate_id} className="flex flex-wrap items-center gap-2">
                <span className={d.match_type === 'exact' ? 'font-medium text-danger' : 'font-medium'}>
                  {d.match_type === 'exact' ? 'Точний збіг' : 'Можливий збіг'} ({MATCH_LABELS[d.matched_on] ?? d.matched_on}):
                </span>
                {d.accessible ? (
                  <Link href={`/candidates/${d.candidate_id}`} target="_blank" className="underline">
                    {d.full_name}
                    {d.city ? `, ${d.city}` : ''}
                  </Link>
                ) : (
                  <span className="text-ink-soft">картка, до якої у вас немає доступу</span>
                )}
                {d.owner_name && <span className="text-ink-soft">· відповідальний: {d.owner_name}</span>}
                {vacancyId && d.accessible && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      const data = new FormData();
                      data.set('vacancy_id', vacancyId);
                      data.set('candidate_id', d.candidate_id);
                      startTransition(async () => {
                        const result = await addApplication({}, data);
                        if (result.error) setDupMessage(result.error);
                        else router.push(`/vacancies/${vacancyId}?notice=candidate_added&candidate=${d.candidate_id}`);
                      });
                    }}
                  >
                    Додати цього кандидата у вакансію
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {dupMessage && (
            <div className="mt-3">
              <Alert>{dupMessage}</Alert>
            </div>
          )}
          <p className="mt-3 text-sm text-ink-soft">
            Відкрийте знайдену картку (у новій вкладці) і перевірте. Якщо це інша людина — збережіть все одно.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={pending}
            onClick={() => {
              if (confirmRef.current) confirmRef.current.value = 'yes';
              formRef.current?.requestSubmit();
            }}
          >
            Це інша людина — зберегти
          </Button>
        </div>
      )}

      {state.error && <Alert>{state.error}</Alert>}

      {!isEdit && (
        <section className="space-y-2 rounded-xl border border-accent/50 bg-accent-soft/40 p-4">
          <Field
            label="Резюме"
            htmlFor="resume"
            hint="Оберіть файл — ПІБ, телефон, email, місто і зарплата заповняться автоматично. PDF, DOCX, RTF, TXT (а також DOC, JPG, PNG без розпізнавання) — до 20 МБ"
          >
            <input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx,.rtf,.txt,.jpg,.jpeg,.png"
              onChange={(e) => onResumeChosen(e.currentTarget)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-field-line file:bg-field file:px-3 file:py-2 file:text-sm focus:bg-white"
            />
          </Field>
          {parsing && <p className="text-sm text-ink-soft">Читаємо резюме…</p>}
          {parseNote && <Alert kind={parseNote.kind}>{parseNote.text}</Alert>}
          {parseNote?.preview && parseNote.preview.length > 0 && (
            <details className="text-xs text-ink-soft">
              <summary className="cursor-pointer">Що система прочитала на початку резюме</summary>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 font-mono">
                {parseNote.preview.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="ПІБ *" htmlFor="full_name" error={fe.full_name} hint="У порядку: Прізвище Ім'я По батькові">
            <Input id="full_name" name="full_name" defaultValue={c?.full_name} required placeholder="Іваненко Петро Миколайович" />
          </Field>
        </div>
        <Field label="Телефон" htmlFor="phone" error={fe.phone} hint="У будь-якому форматі, напр. 067 123 45 67">
          <Input id="phone" name="phone" type="tel" defaultValue={c?.phone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email" error={fe.email}>
          <Input id="email" name="email" type="email" defaultValue={c?.email ?? ''} />
        </Field>
        <Field label="Місто" htmlFor="city" error={fe.city}>
          <Input id="city" name="city" defaultValue={c?.city ?? ''} />
        </Field>
        <Field label="LinkedIn" htmlFor="linkedin_url" error={fe.linkedin_url}>
          <Input id="linkedin_url" name="linkedin_url" defaultValue={c?.linkedin_url ?? ''} placeholder="https://www.linkedin.com/in/…" />
        </Field>
        <Field label="Поточна або бажана посада" htmlFor="current_position" error={fe.current_position}>
          <Input id="current_position" name="current_position" defaultValue={c?.current_position ?? ''} />
        </Field>
        <Field label="Джерело *" htmlFor="source_id" error={fe.source_id}>
          <Select id="source_id" name="source_id" defaultValue={c?.source_id ?? ''} required>
            <option value="">— оберіть джерело —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Досвід, років" htmlFor="experience_years" error={fe.experience_years}>
          <Input
            id="experience_years"
            name="experience_years"
            inputMode="decimal"
            defaultValue={c?.total_experience_months != null ? String(Math.round((c.total_experience_months / 12) * 10) / 10) : ''}
          />
        </Field>
        <Field label="Готовий вийти з" htmlFor="available_from" error={fe.available_from}>
          <Input id="available_from" name="available_from" type="date" defaultValue={c?.available_from ?? ''} />
        </Field>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Field label="Бажана зарплата" htmlFor="desired_salary" error={fe.desired_salary}>
            <Input id="desired_salary" name="desired_salary" inputMode="numeric" defaultValue={c?.desired_salary ?? ''} />
          </Field>
          <Field label="Валюта" htmlFor="salary_currency">
            <Select id="salary_currency" name="salary_currency" defaultValue={c?.salary_currency ?? 'UAH'}>
              <option value="UAH">UAH</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Навички" htmlFor="skills" error={fe.skills} hint="Через кому: AutoCAD, кошторис, монолітні роботи">
            <Input id="skills" name="skills" defaultValue={c?.skills.join(', ') ?? ''} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Коментар рекрутера" htmlFor="summary" error={fe.summary}>
            <textarea id="summary" name="summary" rows={4} defaultValue={c?.summary ?? ''} className={textareaClass} />
          </Field>
        </div>
      </section>

      {!isEdit && (
        <>
          <section className="space-y-4 rounded-xl border border-line p-4">
            <div>
              <h3 className="font-medium">Підстава обробки персональних даних *</h3>
              <p className="text-xs text-ink-soft">Вимога закону «Про захист персональних даних» і GDPR. Можна змінити пізніше в картці.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Підстава" htmlFor="legal_basis">
                <Select id="legal_basis" name="legal_basis" defaultValue="pre_contract">
                  {Object.entries(LEGAL_BASIS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Як отримано" htmlFor="consent_source" error={fe.consent}>
                <Input id="consent_source" name="consent_source" defaultValue="Кандидат надіслав резюме сам" />
              </Field>
              <Field label="Діє до (необов'язково)" htmlFor="consent_expires_at">
                <Input id="consent_expires_at" name="consent_expires_at" type="date" />
              </Field>
            </div>
          </section>

        </>
      )}

      <CustomFieldInputs fields={customFields} values={candidate?.custom} errors={fe} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Зберігаємо…' : isEdit ? 'Зберегти зміни' : vacancyId ? 'Створити і додати у вакансію' : 'Створити кандидата'}
        </Button>
        <Link href={cancelHref ?? (c ? `/candidates/${c.id}` : '/candidates')} className="inline-flex items-center px-3 text-sm text-ink-soft underline">
          Скасувати
        </Link>
      </div>
    </form>
  );
}
