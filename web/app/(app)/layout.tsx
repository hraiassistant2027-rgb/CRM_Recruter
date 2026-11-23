import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { visibleMenu, type MenuItemRow } from '@/lib/permissions';
import { Sidebar } from '@/components/sidebar';
import { SignOutButton } from '@/components/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: menuRows } = await supabase
    .from('menu_items')
    .select('id, parent_id, name, icon, sort_order, target_type, target_ref, required_permission, admin_only, is_visible')
    .order('sort_order');

  const menu = visibleMenu((menuRows ?? []) as MenuItemRow[], session.permissions);

  return (
    <div className="flex min-h-screen">
      <Sidebar items={menu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b border-line bg-white px-4 lg:px-8">
          <Link href="/profile" className="rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface">
            {session.profile.full_name}
          </Link>
          <SignOutButton />
        </header>
        <main className="flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
