'use client';
import { useActionState, useRef } from 'react';
import {
  addConsent,
  addNote,
  deleteDocument,
  markReviewed,
  setCandidateDeleted,
  uploadResume,
  withdrawConsent,
} from '../actions';
import { Alert, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState, type FormState } from '@/lib/form-state';
import { LEGAL_BASIS_LABELS } from '@/lib/candidates';

function Message({ state }: { state: FormState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok) return <Alert kind="success">{state.ok}</Alert>;
  return null;
}

export function DeleteRestoreButton({ id, deleted, name }: { id: string; deleted: boolean; name: string }) {
  const [state, action] = useActionState(setCandidateDeleted, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!deleted && !confirm(`Перенести «${name}» у кошик? Відновити зможе адміністратор.`)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="deleted" value={deleted ? 'false' : 'true'} />
      <SubmitButton variant={deleted ? 'secondary' : 'danger'} pendingText="…">
        {deleted ? 'Відновити' : 'У кошик'}
      </SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function MarkReviewedButton({ id }: { id: string }) {
  const [state, action] = useActionState(markReviewed, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" pendingText="…">Позначити як перевірене</SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function UploadResumeForm({ candidateId }: { candidateId: string }) {
  const [state, action] = useActionState(uploadResume, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input
        name="resume"
        type="file"
        required
        accept=".pdf,.doc,.docx,.rtf,.txt,.jpg,.jpeg,.png"
        aria-label="Файл резюме"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-field-line file:bg-field file:px-3 file:py-2 file:text-sm focus:bg-white"
      />
      <p className="text-xs text-ink-soft">PDF, DOC, DOCX, RTF, TXT, JPG, PNG — до 20 МБ</p>
      <SubmitButton variant="secondary" pendingText="Завантажуємо…">Завантажити резюме</SubmitButton>
      <Message state={state} />
    </form>
  );
}

export function DeleteDocumentButton({ id, candidateId, name }: { id: string; candidateId: string; name: string }) {
  const [state, action] = useActionState(deleteDocument, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Перенести файл «${name}» у кошик?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      <SubmitButton variant="ghost" pendingText="…">Видалити</SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function ConsentForm({ candidateId }: { candidateId: string }) {
  const [state, action] = useActionState(addConsent, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <Field label="Підстава" htmlFor="legal_basis">
        <Select id="legal_basis" name="legal_basis" defaultValue="consent">
          {Object.entries(LEGAL_BASIS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Як отримано" htmlFor="consent_source">
        <Input id="consent_source" name="consent_source" placeholder="Напр.: письмова згода на співбесіді 24.11" />
      </Field>
      <Field label="Діє до (необов'язково)" htmlFor="consent_expires_at">
        <Input id="consent_expires_at" name="consent_expires_at" type="date" />
      </Field>
      <SubmitButton variant="secondary" pendingText="…">Додати</SubmitButton>
      <Message state={state} />
    </form>
  );
}

export function WithdrawConsentButton({ id, candidateId }: { id: string; candidateId: string }) {
  const [state, action] = useActionState(withdrawConsent, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('Позначити згоду як відкликану? Це фіксується в журналі.')) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      <SubmitButton variant="ghost" pendingText="…">Відкликано</SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export function NoteForm({ candidateId }: { candidateId: string }) {
  const [state, action] = useActionState(addNote, initialFormState);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <textarea
        name="body"
        rows={3}
        required
        aria-label="Текст нотатки"
        placeholder="Результат дзвінка, домовленості, враження…"
        className="block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm focus:border-accent-strong focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent/15"
      />
      <SubmitButton variant="secondary" pendingText="…">Додати нотатку</SubmitButton>
      <Message state={state} />
    </form>
  );
}
