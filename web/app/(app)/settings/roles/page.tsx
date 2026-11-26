import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { CreateRoleForm, RoleEditor, type PermRow } from './forms';

export const metadata: Metadata = { title: 'Ролі та права' };

type Role = { id: string; code: string; name: string; description: string | null; is_system: boolean };

export default async function RolesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('roles.manage');
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rp }, { data: ur }] = await Promise.all([
    supabase.from('roles').select('id, code, name, description, is_system').order('is_system', { ascending: false }).order('name'),
    supabase.from('permissions').select('code, module, name').order('module').order('code'),
    supabase.from('role_permissions').select('role_id, permission_code, scope'),
    supabase.from('user_roles').select('role_id'),
  ]);
  const roleList = (roles ?? []) as Role[];
  const selected = roleList.find((r) => r.id === one('role')) ?? null;
  const usersBy = new Map<string, number>();
  for (const u of (ur ?? []) as { role_id: string }[]) usersBy.set(u.role_id, (usersBy.get(u.role_id) ?? 0) + 1);
  const granted: Record<string, string> = {};
  for (const r of (rp ?? []) as { role_id: string; permission_code: string; scope: string }[]) {
    if (selected && r.role_id === selected.id) granted[r.permission_code] = r.scope;
  }
  const notice = one('notice');
  const { data: me } = await supabase.from('user_roles').select('roles(code)').eq('user_id', session.userId);
  const isSuperAdmin = ((me ?? []) as { roles: { code: string } | { code: string }[] | null }[]).some((r) =>
    (Array.isArray(r.roles) ? r.roles : r.roles ? [r.roles] : []).some((x) => x.code === 'super_admin'),
  );

  return (
    <>
      <PageHeader
        title="Ролі та права доступу"
        description="Яка роль що бачить і що може робити. Роль користувачу призначається в розділі «Користувачі»"
        actions={<Link href="/settings" className="text-sm text-ink-soft underline">← Налаштування</Link>}
      />
      {notice === 'created' && <div className="mb-4"><Alert kind="success">Роль створено. Оберіть для неї права і натисніть «Зберегти роль».</Alert></div>}
      {notice === 'deleted' && <div className="mb-4"><Alert kind="success">Роль видалено.</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-lg font-bold tracking-tight">Ролі</h2>
            <ul className="divide-y divide-line">
              {roleList.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/settings/roles?role=${r.id}`}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm ${selected?.id === r.id ? 'bg-accent-soft font-medium' : 'hover:bg-surface'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{r.name}</span>
                      {r.description && <span className="block truncate text-xs font-normal text-ink-soft">{r.description}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.is_system && <Badge>системна</Badge>}
                      <span className="text-xs text-ink-soft">{usersBy.get(r.id) ?? 0} кор.</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold tracking-tight">Нова роль</h2>
            <CreateRoleForm />
          </Card>
        </div>
        <Card>
          {selected ? (
            <>
              <h2 className="mb-3 text-lg font-bold tracking-tight">Роль «{selected.name}»</h2>
              <RoleEditor
                key={selected.id}
                role={selected}
                perms={(perms ?? []) as PermRow[]}
                granted={granted}
                locked={selected.code === 'super_admin'}
                usersCount={usersBy.get(selected.id) ?? 0}
                canDelete={!['super_admin', 'admin'].includes(selected.code) && (!selected.is_system || isSuperAdmin)}
              />
            </>
          ) : (
            <p className="text-sm text-ink-soft">Оберіть роль зліва, щоб переглянути або змінити її права.</p>
          )}
        </Card>
      </div>
    </>
  );
}
