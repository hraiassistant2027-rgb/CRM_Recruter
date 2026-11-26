import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/candidates';
import { inactiveState } from '@/lib/robota';
import { AddAccountForm, DeleteAccountButton, PasswordForm, SyncNowButton, VacancyLink } from './forms';

export const metadata: Metadata = { title: 'Сайти вакансій — налаштування' };

type AccountRow = { id: string; label: string; login: string; status: string; last_sync_at: string | null; last_error: string | null; imported_total: number };
type VacRow = { account_id: string; external_id: number; name: string; state: string | null; city: string | null; vacancy_id: string | null };

export default async function JobBoardsPage() {
  await requirePermission('settings.manage');
  const supabase = await createClient();
  const [{ data: accounts }, { data: vacs }, { data: crm }] = await Promise.all([
    supabase.from('job_board_accounts').select('id, label, login, status, last_sync_at, last_error, imported_total').order('created_at'),
    supabase.from('job_board_vacancies').select('account_id, external_id, name, state, city, vacancy_id').order('last_seen_at', { ascending: false }),
    supabase.from('vacancies').select('id, title').in('status', ['open', 'on_hold', 'draft']).is('deleted_at', null).order('title'),
  ]);
  const accs = (accounts ?? []) as AccountRow[];
  const vacancies = (vacs ?? []) as VacRow[];
  const options = (crm ?? []) as { id: string; title: string }[];

  return (
    <>
      <PageHeader
        title="Сайти вакансій"
        description="Відгуки з кабінетів роботодавця на robota.ua автоматично потрапляють у CRM: кандидат, резюме і участь у вакансії."
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Кабінети robota.ua</h2>
              <p className="mt-1 text-sm text-ink-soft">Поки CRM відкрита, нові відгуки забираються автоматично раз на 15 хвилин.</p>
            </div>
            {accs.length > 0 && <SyncNowButton />}
          </div>
          {accs.length === 0 && <p className="text-sm text-ink-soft">Ще жодного кабінету не підключено.</p>}
          <ul className="divide-y divide-line">
            {accs.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    {a.label} <span className="font-normal text-ink-soft">· {a.login}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    {a.status === 'error' ? <Badge tone="danger">Помилка</Badge> : <Badge tone="ok">Працює</Badge>}
                    <span>Останнє оновлення: {a.last_sync_at ? formatDate(a.last_sync_at, true) : 'ще не було'}</span>
                    <span>· Імпортовано відгуків: {a.imported_total}</span>
                  </div>
                  {a.last_error && <p className="text-xs text-danger">{a.last_error}</p>}
                </div>
                <div className="flex flex-wrap items-start gap-1">
                  <PasswordForm id={a.id} />
                  <DeleteAccountButton id={a.id} label={a.label} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {accs.map((a) => {
          const list = vacancies.filter((v) => v.account_id === a.id && !inactiveState(v.state));
          if (!list.length) return null;
          return (
            <Card key={`v-${a.id}`} className="space-y-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight">Вакансії кабінету «{a.label}»</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Оберіть, у яку вакансію CRM додавати відгуки. Однакові назви CRM пов’язує сама. Якщо не пов’язати — кандидати
                  потрапляють лише в базу, а після зв’язування автоматично додаються у вакансію.
                </p>
              </div>
              <div className="divide-y divide-line">
                {list.map((v) => (
                  <div key={v.external_id} className="grid items-center gap-2 py-2 md:grid-cols-[1fr_minmax(16rem,22rem)]">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.name || `Вакансія ${v.external_id}`}</p>
                      <p className="text-xs text-ink-soft">{[v.city, v.state].filter(Boolean).join(' · ')}</p>
                    </div>
                    <VacancyLink accountId={a.id} externalId={Number(v.external_id)} current={v.vacancy_id} options={options} />
                  </div>
                ))}
              </div>
            </Card>
          );
        })}

        <Card className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight">Підключити кабінет</h2>
          <AddAccountForm />
          <div className="space-y-1 text-xs text-ink-soft">
            <p>Кабінет підключається до простору, у якому ви зараз (KAN Talent або HomeHub). Кабінетів може бути кілька.</p>
            <p>Використовуйте логін і пароль, з якими входите на robota.ua як роботодавець. Якщо змінюєте пароль на сайті — оновіть його тут.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
