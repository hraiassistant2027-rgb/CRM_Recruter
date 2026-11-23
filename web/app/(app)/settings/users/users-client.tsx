'use client';
import { useActionState, useState } from 'react';
import { inviteUser, resetUserMfa, setUserActive, setUserRoles } from './actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';
import type { RoleRow, UserRow } from './page';

export function InviteForm({ roles }: { roles: RoleRow[] }) {
  const [state, action] = useActionState(inviteUser, initialFormState);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1fr_220px_auto] md:items-end" noValidate>
      <Field label="Ім'я та прізвище" htmlFor="full_name">
        <Input id="full_name" name="full_name" required />
      </Field>
      <Field label="Email" htmlFor="invite_email">
        <Input id="invite_email" name="email" type="email" required />
      </Field>
      <Field label="Роль" htmlFor="role_code">
        <Select id="role_code" name="role_code" defaultValue="recruiter">
          {roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pendingText="Надсилаємо…">Надіслати запрошення</SubmitButton>
      {(state.error || state.ok) && (
        <div className="md:col-span-4">
          {state.error ? <Alert>{state.error}</Alert> : <Alert kind="success">{state.ok}</Alert>}
        </div>
      )}
    </form>
  );
}

export function UserActions({ user, roles, canRoles, isSelf }: { user: UserRow; roles: RoleRow[]; canRoles: boolean; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [activeState, activeAction] = useActionState(setUserActive, initialFormState);
  const [rolesState, rolesAction] = useActionState(setUserRoles, initialFormState);
  const [mfaState, mfaAction] = useActionState(resetUserMfa, initialFormState);
  const message = [activeState, rolesState, mfaState].find((s) => s.error || s.ok);

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canRoles && (
          <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Скасувати' : 'Ролі'}
          </Button>
        )}
        {user.has_mfa && (
          <form
            action={mfaAction}
            onSubmit={(e) => {
              if (!confirm(`Скинути двофакторну перевірку для ${user.full_name}? Користувач налаштує її заново при вході.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="user_id" value={user.id} />
            <SubmitButton variant="secondary" pendingText="…">Скинути MFA</SubmitButton>
          </form>
        )}
        {!isSelf && (
          <form
            action={activeAction}
            onSubmit={(e) => {
              if (user.is_active && !confirm(`Заблокувати доступ для ${user.full_name}?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="active" value={user.is_active ? 'false' : 'true'} />
            <SubmitButton variant={user.is_active ? 'danger' : 'secondary'} pendingText="…">
              {user.is_active ? 'Заблокувати' : 'Розблокувати'}
            </SubmitButton>
          </form>
        )}
      </div>

      {editing && canRoles && (
        <form action={rolesAction} className="w-full rounded-lg border border-line bg-surface p-4 sm:w-80">
          <input type="hidden" name="user_id" value={user.id} />
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Ролі користувача</legend>
            {roles.map((r) => (
              <label key={r.code} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="roles" value={r.code} defaultChecked={user.role_codes.includes(r.code)} className="mt-0.5 accent-[var(--color-accent-strong)]" />
                <span>
                  {r.name}
                  {r.description && <span className="block text-xs text-ink-soft">{r.description}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <SubmitButton className="mt-4 w-full" pendingText="Зберігаємо…">Зберегти ролі</SubmitButton>
        </form>
      )}

      {message && (
        <div className="w-full sm:w-80">
          {message.error ? <Alert>{message.error}</Alert> : <Alert kind="success">{message.ok}</Alert>}
        </div>
      )}
    </div>
  );
}
