'use client';
import Link from 'next/link';
import { useActionState, useTransition } from 'react';
import { saveVacancy, type VacancyFormState } from './actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { PRIORITY_LABELS, VACANCY_STATUS_LABELS, type VacancyRow } from '@/lib/vacancies';

type Option = { id: string; name: string };

const textareaClass =
  'block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/30';

export function VacancyForm({
  vacancy,
  sites,
  departments,
  users,
  currentUserId,
}: {
  vacancy?: VacancyRow;
  sites: Option[];
  departments: Option[];
  users: Option[];
  currentUserId: string;
}) {
  const [state, action] = useActionState<VacancyFormState, FormData>(saveVacancy, {});
  const [pending, startTransition] = useTransition();
  const fe = state.fieldErrors ?? {};
  const v = vacancy;

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {v && <input type="hidden" name="id" value={v.id} />}
      {state.error && <Alert>{state.error}</Alert>}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Назва вакансії *" htmlFor="title" error={fe.title}>
            <Input id="title" name="title" defaultValue={v?.title} placeholder="Прораб на монолітні роботи" />
          </Field>
        </div>
        <Field label="Об'єкт" htmlFor="site_id" error={fe.site_id} hint={sites.length ? undefined : 'Список об\'єктів ведеться в Налаштування → Довідники'}>
          <Select id="site_id" name="site_id" defaultValue={v?.site_id ?? ''}>
            <option value="">— не вказано —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Підрозділ" htmlFor="department_id" error={fe.department_id}>
          <Select id="department_id" name="department_id" defaultValue={v?.department_id ?? ''}>
            <option value="">— не вказано —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Рекрутер" htmlFor="recruiter_id" error={fe.recruiter_id}>
          <Select id="recruiter_id" name="recruiter_id" defaultValue={v?.recruiter_id ?? currentUserId}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Керівник-замовник (користувач CRM)" htmlFor="hiring_manager_id" error={fe.hiring_manager_id} hint="Бачитиме кандидатів цієї вакансії">
          <Select id="hiring_manager_id" name="hiring_manager_id" defaultValue={v?.hiring_manager_id ?? ''}>
            <option value="">— немає —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Керівник-замовник (якщо не користувач CRM)" htmlFor="hiring_manager_name" error={fe.hiring_manager_name}>
          <Input id="hiring_manager_name" name="hiring_manager_name" defaultValue={v?.hiring_manager_name ?? ''} placeholder="ПІБ, посада" />
        </Field>
        <Field label="Кількість місць" htmlFor="headcount" error={fe.headcount}>
          <Input id="headcount" name="headcount" inputMode="numeric" defaultValue={String(v?.headcount ?? 1)} />
        </Field>
        <div className="grid grid-cols-[1fr_1fr_100px] gap-2 md:col-span-2">
          <Field label="Зарплата від" htmlFor="salary_min" error={fe.salary_min}>
            <Input id="salary_min" name="salary_min" inputMode="numeric" defaultValue={v?.salary_min ?? ''} />
          </Field>
          <Field label="Зарплата до" htmlFor="salary_max" error={fe.salary_max}>
            <Input id="salary_max" name="salary_max" inputMode="numeric" defaultValue={v?.salary_max ?? ''} />
          </Field>
          <Field label="Валюта" htmlFor="salary_currency">
            <Select id="salary_currency" name="salary_currency" defaultValue={v?.salary_currency ?? 'UAH'}>
              <option value="UAH">UAH</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
        </div>
        <Field label="Пріоритет" htmlFor="priority" error={fe.priority}>
          <Select id="priority" name="priority" defaultValue={v?.priority ?? 'normal'}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Статус" htmlFor="status" error={fe.status}>
          <Select id="status" name="status" defaultValue={v?.status ?? 'open'}>
            {Object.entries(VACANCY_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Дата відкриття" htmlFor="opened_at" error={fe.opened_at}>
          <Input id="opened_at" name="opened_at" type="date" defaultValue={v?.opened_at ?? new Date().toISOString().slice(0, 10)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Вимоги та умови" htmlFor="requirements" error={fe.requirements}>
            <textarea id="requirements" name="requirements" rows={6} defaultValue={v?.requirements ?? ''} className={textareaClass} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Зберігаємо…' : v ? 'Зберегти зміни' : 'Створити вакансію'}
        </Button>
        <Link href={v ? `/vacancies/${v.id}` : '/vacancies'} className="inline-flex items-center px-3 text-sm text-ink-soft underline">
          Скасувати
        </Link>
      </div>
    </form>
  );
}
