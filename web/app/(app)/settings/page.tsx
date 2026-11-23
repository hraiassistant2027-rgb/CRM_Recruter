import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { Badge, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Налаштування' };

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage');
  const p = session.permissions;

  const sections = [
    { title: 'Користувачі та ролі', text: 'Запрошення, призначення ролей, блокування, скидання двофакторної перевірки', href: '/settings/users', allowed: can(p, 'users.manage'), stage: null },
    { title: 'Об\'єкти та підрозділи', text: 'Довідник будівельних об\'єктів і підрозділів', href: null, allowed: true, stage: 4 },
    { title: 'Етапи воронки', text: 'Назви, кольори, порядок і правила переходів між етапами', href: null, allowed: true, stage: 4 },
    { title: 'Джерела та причини відмов', text: 'Довідники для карток кандидатів і відгуків', href: null, allowed: true, stage: 3 },
    { title: 'Конструктор ролей', text: 'Створення нових ролей і детальні права доступу до модулів і полів', href: null, allowed: true, stage: 8 },
  ].filter((s) => s.allowed);

  return (
    <>
      <PageHeader title="Налаштування" />
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((s) =>
          s.href ? (
            <Link key={s.title} href={s.href}>
              <Card className="h-full transition-colors hover:border-accent">
                <h2 className="font-medium">{s.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{s.text}</p>
              </Card>
            </Link>
          ) : (
            <Card key={s.title} className="h-full opacity-70">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium">{s.title}</h2>
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
