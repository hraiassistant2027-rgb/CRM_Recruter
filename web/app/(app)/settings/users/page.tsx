import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { InviteForm, UserActions, WorkspaceAccess } from './users-client';
import { getWorkspaces } from '@/lib/workspace-server';

export const metadata: Metadata = { title: 'Користувачі' };

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  mfa_required: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  has_mfa: boolean;
  role_codes: string[];
};
export type RoleRow = { code: string; name: string; description: string | null };

function formatDate(value: string | null) {
  if (!value) return 'ще не входив(-ла)';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv' }).format(new Date(value));
}

export default async function UsersPage() {
  const session = await requirePermission('users.manage');
  const canRoles = can(session.permissions, 'roles.manage');
  const supabase = await createClient();

  const [{ data: users, error }, { data: roles }, { data: members }, { list: workspaces }] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase.from('roles').select('code, name, description').order('name'),
    supabase.from('workspace_members').select('user_id, workspace_id'),
    getWorkspaces(),
  ]);
  const memberOf = new Map<string, string[]>();
  for (const m of (members ?? []) as { user_id: string; workspace_id: string }[]) {
    memberOf.set(m.user_id, [...(memberOf.get(m.user_id) ?? []), m.workspace_id]);
  }
  const userRows = (users ?? []) as UserRow[];
  // Видаляти користувачів може лише Супер адміністратор
  const isSuperAdmin = userRows.some((u) => u.id === session.userId && u.role_codes.includes('super_admin'));
  const roleRows = (roles ?? []) as RoleRow[];
  const roleName = new Map(roleRows.map((r) => [r.code, r.name]));

  return (
    <>
      <PageHeader
        title="Користувачі та ролі"
        description="Вхід до CRM — лише за запрошенням. Двофакторна перевірка обов'язкова для всіх."
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />

      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-bold tracking-tight">Запросити користувача</h2>
        <InviteForm roles={roleRows} />
      </Card>

      {error && <Alert>Не вдалося завантажити список користувачів.</Alert>}

      <div className="space-y-3">
        {userRows.map((u) => (
          <Card key={u.id} className={u.is_active ? '' : 'opacity-70'}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{u.full_name}</h3>
                  {u.id === session.userId && <Badge>це ви</Badge>}
                  {!u.is_active && <Badge tone="danger">заблоковано</Badge>}
                  {u.has_mfa ? <Badge tone="ok">MFA налаштовано</Badge> : <Badge tone="warn">MFA ще не налаштовано</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{u.email}</p>
                <p className="mt-1 text-xs text-ink-soft">Останній вхід: {formatDate(u.last_sign_in_at)}</p>
                <p className="mt-2 flex flex-wrap gap-1">
                  {u.role_codes.length === 0 ? (
                    <Badge tone="warn">без ролі — доступу немає</Badge>
                  ) : (
                    u.role_codes.map((c) => <Badge key={c}>{roleName.get(c) ?? c}</Badge>)
                  )}
                </p>
              </div>
              <UserActions user={u} roles={roleRows} canRoles={canRoles} isSelf={u.id === session.userId} canDelete={isSuperAdmin} />
            </div>
            {workspaces.length > 1 && (
              <div className="mt-3 border-t border-line pt-3">
                {u.role_codes.some((c) => c === 'super_admin' || c === 'admin') ? (
                  <p className="text-sm text-ink-soft">Простори: усі (адміністратор перемикається кліком на логотип)</p>
                ) : (
                  <WorkspaceAccess userId={u.id} workspaces={workspaces} memberOf={memberOf.get(u.id) ?? []} />
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
