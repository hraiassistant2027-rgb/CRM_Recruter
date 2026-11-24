'use client';
import { useActionState } from 'react';
import { addApplication } from '../../vacancies/actions';
import { Alert, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';

export function AddToVacancyForm({ candidateId, vacancies }: { candidateId: string; vacancies: { id: string; title: string }[] }) {
  const [state, action] = useActionState(addApplication, initialFormState);
  if (vacancies.length === 0) return <p className="text-sm text-ink-soft">Немає відкритих вакансій, куди можна додати кандидата.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <label className="block">
        <span className="sr-only">Вакансія</span>
        <Select name="vacancy_id" defaultValue="">
          <option value="" disabled>
            Оберіть вакансію…
          </option>
          {vacancies.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </Select>
      </label>
      <SubmitButton variant="secondary" pendingText="…">Додати у відбір</SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert kind="success">Додано: {state.ok}</Alert>}
    </form>
  );
}
