'use client';
import { useActionState, useTransition } from 'react';
import { createRole, deleteRole, updateRole } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';
import { initialFormState } from '@/lib/form-state';

export type PermRow = { code: string; module: string; name: string };

const MODULE_LABELS: Record<string, string> = {
  candidates: 'Кандидати',
  vacancies: 'Вакансії',
  pipeline: 'Воронка і задачі',
  communications: 'Пошта і шаблони',
  calendar: 'Календар',
  analytics: 'Аналітика і звіти',
  settings: 'Налаштування',
  builder: 'Конструктор CRM',
};

// Дозволи, для яких має сенс «лише свої» (відповідальний, власник або керівник вакансії)
const OWN_SCOPE = new Set([
  'candidates.read', 'candidates.update', 'vacancies.read', 'vacancies.manage',
  'applications.read', 'applications.create', 'applications.update', 'interviews.manage',
]);

export function CreateRoleForm() {
  const [state, action] = useActionState(createRole, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <Field label="Назва ролі" htmlFor="new-role-name">
        <Input id="new-role-name" name="name" placeholder="Напр.: Кадровик" />
      </Field>
      <Field label="Опис (необов'язково)" htmlFor="new-role-desc">
        <Input id="new-role-desc" name="description" />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit">Створити роль</Button>
    </form>
  );
}

export function RoleEditor({
  role,
  perms,
  granted,
  locked,
  usersCount,
}: {
  role: { id: string; name: string; description: string | null; is_system: boolean };
  perms: PermRow[];
  granted: Record<string, string>;
  locked: boolean;
  usersCount: number;
}) {
  const [state, action] = useActionState(updateRole, initialFormState);
  const [delState, delAction] = useActionState(deleteRole, initialFormState);
  const [pending, start] = useTransition();
  const modules = [...new Set(perms.map((p) => p.module))];

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(() => action(fd));
        }}
      >
        <input type="hidden" name="id" value={role.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Назва ролі" htmlFor="role-name">
            <Input id="role-name" name="name" defaultValue={role.name} />
          </Field>
          <Field label="Опис" htmlFor="role-desc">
            <Input id="role-desc" name="description" defaultValue={role.description ?? ''} />
          </Field>
        </div>
        {locked && <Alert kind="info">Права ролі SUPER ADMIN не змінюються, щоб завжди залишався хтось із повним доступом.</Alert>}
        <div className="space-y-4">
          {modules.map((m) => (
            <fieldset key={m} className="rounded-lg border border-line">
              <legend className="ml-3 px-1 text-sm font-medium">{MODULE_LABELS[m] ?? m}</legend>
              <ul className="divide-y divide-line">
                {perms
                  .filter((p) => p.module === m)
                  .map((p) => (
                    <li key={p.code} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>{p.name}</span>
                      <select
                        name={`perm:${p.code}`}
                        defaultValue={granted[p.code] ?? ''}
                        disabled={locked}
                        aria-label={p.name}
                        className={`rounded border border-line px-2 py-1 text-sm ${granted[p.code] ? 'bg-ok-soft' : 'bg-white'}`}
                      >
                        <option value="">Немає</option>
                        {OWN_SCOPE.has(p.code) && <option value="own">Лише свої</option>}
                        <option value="all">{OWN_SCOPE.has(p.code) ? 'Усі' : 'Так'}</option>
                      </select>
                    </li>
                  ))}
              </ul>
            </fieldset>
          ))}
        </div>
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert kind="success">{state.ok}</Alert>}
        <Button type="submit" disabled={pending}>{pending ? 'Зберігаємо…' : 'Зберегти роль'}</Button>
      </form>
      {!role.is_system && (
        <form action={delAction} className="border-t border-line pt-4">
          <input type="hidden" name="id" value={role.id} />
          <p className="mb-2 text-xs text-ink-soft">
            {usersCount ? `Роль має ${usersCount} користувачів — видалити можна після зміни їм ролі.` : 'Роль нікому не призначена — її можна видалити.'}
          </p>
          {delState.error && <div className="mb-2"><Alert>{delState.error}</Alert></div>}
          <Button type="submit" variant="danger" disabled={usersCount > 0}>Видалити роль</Button>
        </form>
      )}
    </div>
  );
}
