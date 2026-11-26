import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { PasswordForm, ProfileForm } from './profile-forms';
import { Alert } from '@/components/ui';
import { DisconnectGoogleButton } from '@/components/google-connection';
import { googleConfigured } from '@/lib/google';
import { formatDate } from '@/lib/candidates';

const GOOGLE_NOTICES: Record<string, { kind: 'success' | 'error' | 'info'; text: string }> = {
  connected: { kind: 'success', text: 'Google-акаунт підключено. Тепер можна надсилати листи кандидатам з картки.' },
  partial: { kind: 'info', text: 'Google підключено, але не всі дозволи надано. Натисніть «Підключити знову» і поставте всі галочки.' },
  denied: { kind: 'info', text: 'Підключення скасовано.' },
  state: { kind: 'error', text: 'Не вдалося перевірити запит. Спробуйте ще раз.' },
  no_refresh: { kind: 'error', text: 'Google не видав постійного дозволу. Спробуйте ще раз.' },
  error: { kind: 'error', text: 'Помилка під час підключення Google. Спробуйте пізніше.' },
  not_configured: { kind: 'info', text: 'Інтеграцію з Google ще не налаштовано адміністратором.' },
};

export const metadata: Metadata = { title: 'Мій профіль' };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: google } = await supabase
    .from('email_accounts')
    .select('google_email, status, connected_at, last_sync_at, last_error')
    .eq('user_id', session.userId)
    .maybeSingle();
  const googleNotice = GOOGLE_NOTICES[String(Array.isArray(sp.google) ? sp.google[0] : sp.google ?? '')];
  const googleActive = google?.status === 'active';
  const { data: roles } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', session.userId);
  const roleNames = (roles ?? [])
    .map((r: { roles: { name: string } | { name: string }[] | null }) => (Array.isArray(r.roles) ? r.roles[0]?.name : r.roles?.name))
    .filter(Boolean) as string[];

  return (
    <>
      <PageHeader title="Мій профіль" description={session.profile.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-medium">Особисті дані</h2>
          <ProfileForm fullName={session.profile.full_name} phone={session.profile.phone} />
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-medium">Доступ</h2>
            <p className="mb-2 flex flex-wrap gap-1">
              {roleNames.length ? roleNames.map((n) => <Badge key={n}>{n}</Badge>) : <Badge tone="warn">роль не призначено</Badge>}
            </p>
            <p className="text-sm text-ink-soft">
              Двофакторна перевірка:{' '}
              {session.aal === 'aal2' ? <Badge tone="ok">увімкнена і підтверджена</Badge> : <Badge tone="warn">не підтверджена</Badge>}
            </p>
            <p className="mt-2 text-xs text-ink-soft">Якщо втратили телефон з автентифікатором — зверніться до адміністратора, він скине MFA.</p>
          </Card>
          <Card>
            <h2 className="mb-1 font-medium">Google (Gmail і Календар)</h2>
            <p className="mb-3 text-xs text-ink-soft">
              Листи кандидатам надсилатимуться з вашої скриньки, а співбесіди — створюватимуться у вашому календарі. Пароль від пошти CRM не бачить.
            </p>
            {googleNotice && (
              <div className="mb-3">
                <Alert kind={googleNotice.kind}>{googleNotice.text}</Alert>
              </div>
            )}
            {googleActive ? (
              <div className="space-y-3 text-sm">
                <p>
                  Підключено: <strong>{google!.google_email}</strong> <Badge tone="ok">активно</Badge>
                </p>
                <p className="text-xs text-ink-soft">
                  З {formatDate(google!.connected_at, true)}
                  {google!.last_sync_at ? ` · остання перевірка пошти ${formatDate(google!.last_sync_at, true)}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/google/connect" className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-sm hover:bg-surface">
                    Підключити знову
                  </a>
                  <DisconnectGoogleButton />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {google && google.status !== 'disconnected' && (
                  <Alert>Доступ до Google втрачено{google.last_error ? ` (${google.last_error})` : ''}. Підключіть акаунт знову.</Alert>
                )}
                {googleConfigured() ? (
                  <a href="/api/google/connect" className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong">
                    Підключити Google
                  </a>
                ) : (
                  <p className="text-ink-soft">Інтеграцію з Google ще не налаштовано адміністратором.</p>
                )}
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-4 font-medium">Зміна пароля</h2>
            <PasswordForm />
          </Card>
        </div>
      </div>
    </>
  );
}
