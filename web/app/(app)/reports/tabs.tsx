import Link from 'next/link';

export function ReportTabs({ active }: { active: 'vacancies' | 'analytics' }) {
  const tab = (key: string, href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active === key ? 'bg-accent text-ink' : 'text-ink-soft hover:bg-white'}`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="mb-4 inline-flex gap-1 rounded-xl border border-line bg-surface p-1" aria-label="Звіти">
      {tab('vacancies', '/reports', 'Звіт по вакансіях')}
      {tab('analytics', '/reports/analytics', 'Аналітика')}
    </nav>
  );
}
