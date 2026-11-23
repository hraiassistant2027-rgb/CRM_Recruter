import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Немає доступу' };

export default function ForbiddenPage() {
  return (
    <AuthShell title="Немає доступу до цього розділу" subtitle="Ваша роль не дає права відкривати цю сторінку.">
      <p className="text-sm text-ink-soft">Якщо доступ потрібен для роботи, попросіть адміністратора додати вам відповідну роль.</p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium underline">
        На головну
      </Link>
    </AuthShell>
  );
}
