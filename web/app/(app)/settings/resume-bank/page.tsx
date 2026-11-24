import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { BankFolderForm } from './form';
import { formatDate } from '@/lib/candidates';
import type { BankConfig } from '@/lib/drive';

export const metadata: Metadata = { title: 'Банк резюме — налаштування' };

export default async function BankSettingsPage() {
  await requirePermission('settings.manage');
  const supabase = await createClient();
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'resume_bank').maybeSingle();
  const cfg = data?.value as BankConfig | undefined;
  return (
    <>
      <PageHeader
        title="Банк резюме"
        description="Папка архіву резюме на Google Диску. Файли залишаються на Диску — CRM лише шукає по них."
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      <Card className="max-w-3xl space-y-4">
        {cfg && (
          <p className="text-sm">
            Зараз підключено: <strong>{cfg.folderName}</strong>
            {cfg.driveId ? ' (спільний диск)' : ` — ${cfg.folders.length} папок і підпапок`} · оновлено {formatDate(cfg.updatedAt, true)}
          </p>
        )}
        <BankFolderForm current={cfg ? `https://drive.google.com/drive/folders/${cfg.folderId}` : ''} />
        <div className="space-y-1 text-xs text-ink-soft">
          <p>1. Відкрийте папку архіву в Google Диску і скопіюйте посилання з адресного рядка.</p>
          <p>2. Відкрийте доступ до папки (Поділитися → «Читач») для Google-пошти кожного рекрутера, який шукатиме в банку.</p>
          <p>3. Якщо в архіві з’являться нові підпапки — натисніть «Зберегти» ще раз, щоб CRM їх врахувала.</p>
        </div>
      </Card>
    </>
  );
}
