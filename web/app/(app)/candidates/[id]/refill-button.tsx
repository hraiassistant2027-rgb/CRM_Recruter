'use client';
import { useActionState } from 'react';
import { refillFromResume } from '../actions';
import { SubmitButton } from '@/components/submit-button';
import { Alert } from '@/components/ui';
import { initialFormState } from '@/lib/form-state';

// «Оновити з резюме»: заново розібрати останнє резюме і заповнити досвід, освіту, навички
export function RefillFromResume({ candidateId, hasLists }: { candidateId: string; hasLists: boolean }) {
  const [state, action] = useActionState(refillFromResume, initialFormState);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (hasLists && !window.confirm('Досвід роботи й освіту буде замінено даними з останнього резюме. Продовжити?')) e.preventDefault();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="candidate_id" value={candidateId} />
      <SubmitButton variant="secondary" pendingText="Розбираємо резюме…">
        {hasLists ? 'Оновити з резюме' : 'Заповнити з резюме'}
      </SubmitButton>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.ok}</Alert>}
    </form>
  );
}
