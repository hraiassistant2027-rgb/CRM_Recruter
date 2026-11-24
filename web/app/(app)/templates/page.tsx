import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
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

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await requirePermission('templates.manage');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, category, subject, variables, is_active')
    .order('name');
  const templates = (data ?? []) as TemplateRow[];

  return (
    <>
      <PageHeader
        title="Шаблони листів"
        description="Використовуються під час надсилання листа з картки кандидата"
        actions={
          <Link href="/templates/new" className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">
            <Plus className="h-4 w-4" aria-hidden /> Новий шаблон
          </Link>
        }
      />
      {sp.saved && (
        <div className="mb-4">
          <Alert kind="success">Шаблон збережено</Alert>
        </div>
      )}
      {error && <Alert>Не вдалося завантажити шаблони. Спробуйте оновити сторінку.</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-3">
              <Link href={`/templates/${t.id}`} className="font-medium hover:underline">
                {t.name}
              </Link>
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
