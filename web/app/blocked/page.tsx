import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { SignOutButton } from '@/components/sign-out-button';

export const metadata: Metadata = { title: 'Доступ заблоковано' };

export default function BlockedPage() {
  return (
    <AuthShell title="Доступ заблоковано" subtitle="Ваш обліковий запис неактивний або ще не налаштований адміністратором.">
      <p className="text-sm text-ink-soft">Якщо це помилка, зверніться до адміністратора CRM.</p>
      <div className="mt-6">
        <SignOutButton variant="secondary" />
      </div>
    </AuthShell>
  );
}
