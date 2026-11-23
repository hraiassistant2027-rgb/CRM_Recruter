import { SubmitButton } from '@/components/submit-button';

export function SignOutButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  return (
    <form action="/auth/signout" method="post">
      <SubmitButton variant={variant} pendingText="Виходимо…">Вийти</SubmitButton>
    </form>
  );
}
