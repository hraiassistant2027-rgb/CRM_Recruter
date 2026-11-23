import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from './login-form';
import { safeNext } from '@/lib/validation';

export const metadata: Metadata = { title: 'Вхід' };

const NOTICES: Record<string, string> = {
  link: 'Посилання застаріло або вже використане. Попросіть адміністратора надіслати нове запрошення або відновіть пароль.',
  signed_out: 'Ви вийшли із системи.',
  password_updated: 'Пароль змінено. Увійдіть з новим паролем.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; info?: string }> }) {
  const sp = await searchParams;
  const notice = NOTICES[sp.error ?? ''] ?? NOTICES[sp.info ?? ''];
  return (
    <AuthShell title="Вхід у систему" subtitle="Доступ лише для працівників компанії за запрошенням">
      <LoginForm next={safeNext(sp.next)} notice={notice} />
    </AuthShell>
  );
}
