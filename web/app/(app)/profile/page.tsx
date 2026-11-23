import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { PasswordForm, ProfileForm } from './profile-forms';

export const metadata: Metadata = { title: 'Мій профіль' };

export default async function ProfilePage() {
  const session = await requireSession();
  const supabase = await createClient();
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
            <h2 className="mb-4 font-medium">Зміна пароля</h2>
            <PasswordForm />
          </Card>
        </div>
      </div>
    </>
  );
}
