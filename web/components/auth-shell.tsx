import type { ReactNode } from 'react';

// Оформлення сторінок входу, MFA і відновлення пароля
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-block h-8 w-8 rounded-lg bg-accent" aria-hidden="true" />
          <span className="text-lg font-semibold">HR CRM</span>
        </div>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-soft">
          HR CRM KAN — внутрішня система рекрутингу ·{' '}
          <a href="/privacy" className="underline">
            Політика конфіденційності
          </a>
        </p>
      </div>
    </main>
  );
}
