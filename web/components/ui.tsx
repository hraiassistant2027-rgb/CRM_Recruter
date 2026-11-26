import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' };

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-strong',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-panel',
        variant === 'danger' && 'border border-danger/30 bg-white text-danger hover:bg-danger-soft',
        variant === 'ghost' && 'text-ink-soft hover:bg-surface hover:text-ink',
        className,
      )}
    />
  );
}

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-soft">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft/70 transition-colors',
        'hover:border-ink-soft/40 focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15',
        className,
      )}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm text-ink transition-colors',
        'hover:border-ink-soft/40 focus:border-accent-strong focus:bg-white focus:outline-none focus:ring-4 focus:ring-accent/15',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-2xl border px-4 py-3 text-sm',
        kind === 'error' && 'border-danger/20 bg-danger-soft text-danger',
        kind === 'success' && 'border-ok/20 bg-ok-soft text-ok',
        kind === 'info' && 'border-accent/40 bg-accent-soft text-ink',
      )}
    >
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-3xl bg-white p-6 shadow-card', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'dark'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-surface text-ink-soft',
        tone === 'dark' && 'rounded-md bg-ink px-2 font-bold uppercase tracking-wide text-white',
        tone === 'ok' && 'bg-ok-soft text-ok',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </span>
  );
}

// Розділ, який з'явиться на одному з наступних етапів. Чесно показує це, а не вдає, що працює.
export function ComingSoon({ title, stage, items }: { title: string; stage: number; items: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <div className="flex items-start gap-4">
          <span className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-accent-soft px-2 text-sm font-semibold">
            {stage}
          </span>
          <div>
            <p className="font-medium">Розділ з'явиться на етапі {stage}</p>
            <p className="mt-1 text-sm text-ink-soft">Що тут буде:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}
