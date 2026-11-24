import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can, canOn } from '@/lib/permissions';
import { Alert, Card, PageHeader } from '@/components/ui';
import { ResumeBank } from '@/components/resume-bank';
import { formatDate } from '@/lib/candidates';
import type { BankConfig } from '@/lib/drive';

export const metadata: Metadata = { title: 'Банк резюме' };

export default async function ResumeBankPage() {
  const session = await requirePermission('candidates.read');
  const supabase = await createClient();
  const [{ data: setting }, { data: account }, { data: vacancies }] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'resume_bank').maybeSingle(),
    supabase.from('email_accounts').select('status, scopes').eq('user_id', session.userId).maybeSingle(),
    supabase.from('vacancies').select('id, title, status, recruiter_id, hiring_manager_id').in('status', ['open', 'on_hold', 'draft']).order('opened_at', { ascending: false }),
  ]);
  const cfg = setting?.value as BankConfig | undefined;
  const acc = account as { status: string; scopes: string[] } | null;
  const driveOk = acc?.status === 'active' && (acc.scopes ?? []).some((s) => s.includes('drive'));
  const p = session.permissions;
  const myVacancies = ((vacancies ?? []) as { id: string; title: string; recruiter_id: string | null; hiring_manager_id: string | null }[])
    .filter((v) => canOn(p, 'applications.create', v.recruiter_id === session.userId || v.hiring_manager_id === session.userId))
    .map((v) => ({ id: v.id, title: v.title }));

  return (
    <>
      <PageHeader
        title="Банк резюме"
        description={cfg ? `Архів на Google Диску: «${cfg.folderName}» · оновлено ${formatDate(cfg.updatedAt)}` : 'Пошук по архіву резюме на Google Диску'}
      />
      {!cfg ? (
        <Card>
          <p className="text-sm text-ink-soft">
            Папку архіву ще не підключено.{' '}
            {can(p, 'settings.manage') ? (
              <Link href="/settings/resume-bank" className="underline">
                Підключити в налаштуваннях
              </Link>
            ) : (
              'Зверніться до адміністратора.'
            )}
          </p>
        </Card>
      ) : !driveOk ? (
        <Alert kind="info">
          Щоб шукати в архіві, підключіть Google у{' '}
          <Link href="/profile" className="underline">
            профілі
          </Link>{' '}
          (натисніть «Підключити знову» і дозвольте перегляд файлів Google Диска). Папка архіву має бути відкрита для вашої Google-пошти.
        </Alert>
      ) : (
        <ResumeBank vacancies={myVacancies} canAdd={can(p, 'candidates.create')} />
      )}
    </>
  );
}
