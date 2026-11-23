'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { MenuIcon } from '@/components/icons';
import type { MenuLink } from '@/lib/permissions';

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

export function Sidebar({ items }: { items: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Ноутбук: постійне бокове меню */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="inline-block h-7 w-7 rounded-lg bg-accent" aria-hidden="true" />
          <span className="font-semibold">HR CRM</span>
        </Link>
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
                <span className="font-semibold">HR CRM</span>
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
