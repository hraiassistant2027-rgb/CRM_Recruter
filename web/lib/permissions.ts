// Дозволи та меню. Інтерфейс лише ховає недоступне — справжній контроль виконує база (RLS).

export type Scope = 'all' | 'own';
export type Permissions = Record<string, Scope>;

export function toPermissions(rows: { permission_code: string; scope: string }[] | null | undefined): Permissions {
  const result: Permissions = {};
  for (const row of rows ?? []) {
    result[row.permission_code] = row.scope === 'all' ? 'all' : 'own';
  }
  return result;
}

export function can(perms: Permissions, code: string): boolean {
  return code in perms;
}

// Чи має користувач право на конкретний запис: «усі» або «свої», якщо запис його
export function canOn(perms: Permissions, code: string, isMine: boolean): boolean {
  return perms[code] === 'all' || (perms[code] === 'own' && isMine);
}

export type MenuItemRow = {
  id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  target_type: string;
  target_ref: string | null;
  required_permission: string | null;
  admin_only: boolean;
  is_visible: boolean;
};

export type MenuLink = { id: string; name: string; icon: string | null; href: string };

// Системні розділи головного меню і їхні адреси
export const SYSTEM_ROUTES: Record<string, string> = {
  dashboard: '/',
  candidates: '/candidates',
  vacancies: '/vacancies',
  pipeline: '/pipeline',
  calendar: '/calendar',
  inbox: '/inbox',
  recruiters: '/recruiters',
  reports: '/reports',
  templates: '/templates',
  settings: '/settings',
  builder: '/builder',
};

export function menuHref(item: Pick<MenuItemRow, 'target_type' | 'target_ref'>): string | null {
  if (!item.target_ref) return null;
  switch (item.target_type) {
    case 'system':
      return SYSTEM_ROUTES[item.target_ref] ?? null;
    case 'page':
      return `/p/${encodeURIComponent(item.target_ref)}`;
    case 'module':
      return `/m/${encodeURIComponent(item.target_ref)}`;
    case 'url':
      return /^https:\/\//.test(item.target_ref) ? item.target_ref : null;
    default:
      return null;
  }
}

export function visibleMenu(items: MenuItemRow[], perms: Permissions): MenuLink[] {
  return items
    .filter((i) => i.is_visible && i.parent_id === null)
    .filter((i) => !i.required_permission || can(perms, i.required_permission))
    .filter((i) => !i.admin_only || can(perms, 'builder.edit'))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'uk'))
    .flatMap((i) => {
      const href = menuHref(i);
      return href ? [{ id: i.id, name: i.name, icon: i.icon, href }] : [];
    });
}
