import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Шаблони листів' };

const CATEGORY: Record<string, string> = {
  invite: 'Запрошення',
  next_stage: 'Наступний етап',
  rejection: 'Відмова',
  received: 'Резюме отримано',
  offer: 'Оффер',
  custom: 'Інше',
};

type TemplateRow = { id: string; name: string; category: string; subject: string; variables: string[]; is_active: boolean };

export default async function TemplatesPage() {
  await requirePermission('templates.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, category, subject, variables, is_active')
    .order('name');
  const templates = (data ?? []) as TemplateRow[];

  return (
    <>
      <PageHeader title="Шаблони листів" description="Базові шаблони вже в системі. Редагування і надсилання листів — етап 5 (Gmail)." />
      {error && <Alert>Не вдалося завантажити шаблони. Спробуйте оновити сторінку.</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{t.name}</h2>
              <Badge tone={t.is_active ? 'ok' : 'neutral'}>{t.is_active ? 'Активний' : 'Вимкнено'}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-soft">{CATEGORY[t.category] ?? t.category}</p>
            <p className="mt-3 text-sm">
              <span className="text-ink-soft">Тема: </span>
              {t.subject}
            </p>
            {t.variables.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1">
                {t.variables.map((v) => (
                  <code key={v} className="rounded bg-surface px-1.5 py-0.5 text-xs">{`{{${v}}}`}</code>
                ))}
              </p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
