import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Badge, Card, PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';
import { formatBytes, loadStorageUsage } from '@/lib/storage-usage';

export const metadata: Metadata = { title: 'Налаштування' };

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage');
  const p = session.permissions;
  const usage = await loadStorageUsage(await createClient());

  const sections = [
    { title: 'Користувачі та ролі', text: 'Запрошення, призначення ролей, блокування, скидання двофакторної перевірки', href: '/settings/users', allowed: can(p, 'users.manage'), stage: null },
    { title: 'Довідники', text: 'Кадровики, об\'єкти, підрозділи, джерела кандидатів, причини відмов', href: '/settings/dictionaries', allowed: true, stage: null },
    { title: 'Сайти вакансій', text: 'Кабінети роботодавця на robota.ua: автоматичне отримання відгуків', href: '/settings/job-boards', allowed: true, stage: null },
    { title: 'Банк резюме', text: 'Папка архіву резюме на Google Диску для пошуку', href: '/settings/resume-bank', allowed: true, stage: null },
    { title: 'Етапи воронки', text: 'Назви, кольори, норма днів на етапі, вимкнення етапів', href: '/settings/pipeline', allowed: true, stage: null },
    { title: 'Ролі та права доступу', text: 'Створення нових ролей і налаштування, що кожна роль бачить і може робити', href: '/settings/roles', allowed: can(p, 'roles.manage'), stage: null },
    { title: 'Конструктор CRM', text: 'Власні поля в картках кандидата і вакансії', href: '/builder', allowed: can(p, 'builder.edit'), stage: null },
  ].filter((s) => s.allowed);

  return (
    <>
      <PageHeader title="Налаштування" />
      {usage && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">Сховище резюме</h2>
            <span className="text-sm text-ink-soft">
              {formatBytes(usage.bytes)} з {formatBytes(usage.limit)} · файлів: {usage.files}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(usage.ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Зайнято місця">
            <div
              className={`h-full rounded-full ${usage.ratio >= 0.9 ? 'bg-danger' : usage.ratio >= 0.8 ? 'bg-warn' : 'bg-ok'}`}
              style={{ width: `${Math.min(100, Math.max(1, usage.ratio * 100))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {usage.ratio >= 0.8
              ? 'Місце закінчується — варто перейти на тариф Supabase Pro (100 ГБ). Банк резюме на Google Диску сюди не рахується.'
              : 'Резюме, завантажені в CRM, разом з їх переглядом. Банк резюме на Google Диску сюди не рахується.'}
          </p>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) =>
          s.href ? (
            <Link key={s.title} href={s.href}>
              <Card className="h-full transition-colors hover:border-accent">
                <h2 className="text-lg font-bold tracking-tight">{s.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{s.text}</p>
              </Card>
            </Link>
          ) : (
            <Card key={s.title} className="h-full opacity-70">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">{s.title}</h2>
                <Badge>Етап {s.stage}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{s.text}</p>
            </Card>
          ),
        )}
      </div>
    </>
  );
}
