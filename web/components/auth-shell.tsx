import type { ReactNode } from 'react';

// Оформлення сторінок входу, MFA і відновлення пароля
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="" aria-hidden="true" className="h-11 w-11 rounded-lg" />
          <span className="text-lg font-semibold">KAN Talent</span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-soft">
          KAN Talent — внутрішня система рекрутингу ·{' '}
          <a href="/privacy" className="underline">
            Політика конфіденційності
          </a>
        </p>
      </div>
    </main>
  );
}
