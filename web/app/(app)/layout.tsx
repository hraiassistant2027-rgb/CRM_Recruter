import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { visibleMenu, type MenuItemRow } from '@/lib/permissions';
import { Sidebar } from '@/components/sidebar';
import { SignOutButton } from '@/components/sign-out-button';
import { redirect } from 'next/navigation';
import { getWorkspaces } from '@/lib/workspace-server';
import { switchHref } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: menuRows } = await supabase
    .from('menu_items')
    .select('id, parent_id, name, icon, sort_order, target_type, target_ref, required_permission, admin_only, is_visible')
    .order('sort_order');

  const menu = visibleMenu((menuRows ?? []) as MenuItemRow[], session.permissions);
  const { current, list } = await getWorkspaces();
  // Простір із cookie недоступний цьому користувачу — переходимо в його простір
  if (!current && list.length) redirect(switchHref(list[0].code, '/'));
  const ws = current ?? { code: 'kan' as const, name: 'KAN Talent', icon: '/logo-icon.png', theme: 'kan', id: '' };

  return (
    <div data-theme={ws.theme} className="flex min-h-screen bg-surface">
      <Sidebar items={menu} workspace={ws} workspaces={list} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-2 px-4 pt-2 lg:px-8">
          <span className="mr-auto hidden items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-accent-strong shadow-card sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            {ws.name}
          </span>
          <Link href="/profile" className="rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-card hover:bg-panel">
            {session.profile.full_name}
          </Link>
          <SignOutButton />
        </header>
        <main className="flex-1 px-4 pb-10 pt-4 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
