'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Check, ChevronsUpDown, Menu, X } from 'lucide-react';
import { MenuIcon } from '@/components/icons';
import type { MenuLink } from '@/lib/permissions';
import { switchHref, type WorkspaceCode } from '@/lib/workspace';

type Ws = { code: WorkspaceCode; name: string; icon: string };

// Логотип простору. Якщо доступно кілька просторів (Супер адміністратор, Адміністратор) —
// клік відкриває перемикач KAN Talent / HomeHub.
function WorkspaceLogo({ workspace, workspaces }: { workspace: Ws; workspaces: Ws[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const section = `/${pathname.split('/')[1] ?? ''}`;
  const logo = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={workspace.icon} alt="" aria-hidden="true" className="h-9 w-9 rounded-lg bg-white object-contain" />
      <span className="font-semibold">{workspace.name}</span>
    </>
  );
  if (workspaces.length < 2) {
    return (
      <Link href="/" className="flex items-center gap-2 px-2">
        {logo}
      </Link>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Перемкнути простір"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent-soft"
      >
        {logo}
        <ChevronsUpDown className="ml-auto h-4 w-4 text-ink-soft" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-line bg-white p-1 shadow-lg">
          {workspaces.map((w) => (
            <a
              key={w.code}
              role="menuitem"
              href={w.code === workspace.code ? '/' : switchHref(w.code, section)}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" aria-hidden="true" className="h-7 w-7 rounded-md bg-white object-contain" />
              <span className="flex-1">{w.name}</span>
              {w.code === workspace.code && <Check className="h-4 w-4 text-accent-strong" aria-label="поточний" />}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Nav({ items, onNavigate }: { items: MenuLink[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Головне меню" className="space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent-soft font-medium text-ink' : 'text-ink-soft hover:bg-surface hover:text-ink',
            ].join(' ')}
          >
            <MenuIcon name={item.icon} className={active ? 'h-4 w-4 text-accent-strong' : 'h-4 w-4'} />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ items, workspace, workspaces }: { items: MenuLink[]; workspace: Ws; workspaces: Ws[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Ноутбук: постійне бокове меню */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line border-t-4 border-t-accent bg-white p-4 lg:flex">
        <div className="mb-6">
          <WorkspaceLogo workspace={workspace} workspaces={workspaces} />
        </div>
        <Nav items={items} />
      </aside>

      {/* Планшет: меню відкривається кнопкою */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed left-3 top-3 z-30 rounded-lg border border-line bg-white p-2"
          aria-label="Відкрити меню"
        >
          <Menu className="h-5 w-5" />
        </button>
        {open && (
          <div className="fixed inset-0 z-40 flex">
            <div className="h-full w-72 overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-6 flex items-center justify-between px-2">
                <div className="min-w-0 flex-1">
                  <WorkspaceLogo workspace={workspace} workspaces={workspaces} />
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Закрити меню" className="rounded-lg p-1 hover:bg-surface">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Nav items={items} onNavigate={() => setOpen(false)} />
            </div>
            <button type="button" aria-label="Закрити меню" className="flex-1 bg-ink/30" onClick={() => setOpen(false)} />
          </div>
        )}
      </div>
    </>
  );
}
