import { describe, expect, it } from 'vitest';
import { can, menuHref, toPermissions, visibleMenu, type MenuItemRow } from '@/lib/permissions';

const item = (over: Partial<MenuItemRow>): MenuItemRow => ({
  id: over.name ?? 'x',
  parent_id: null,
  name: 'x',
  icon: null,
  sort_order: 0,
  target_type: 'system',
  target_ref: 'dashboard',
  required_permission: null,
  admin_only: false,
  is_visible: true,
  ...over,
});

describe('toPermissions / can', () => {
  it('перетворює рядки з бази на словник', () => {
    const p = toPermissions([
      { permission_code: 'candidates.read', scope: 'all' },
      { permission_code: 'vacancies.manage', scope: 'own' },
    ]);
    expect(p).toEqual({ 'candidates.read': 'all', 'vacancies.manage': 'own' });
    expect(can(p, 'candidates.read')).toBe(true);
    expect(can(p, 'roles.manage')).toBe(false);
  });

  it('порожній результат — жодних прав', () => {
    expect(toPermissions(null)).toEqual({});
  });
});

describe('menuHref', () => {
  it('системні розділи', () => {
    expect(menuHref({ target_type: 'system', target_ref: 'candidates' })).toBe('/candidates');
    expect(menuHref({ target_type: 'system', target_ref: 'unknown' })).toBeNull();
  });
  it('зовнішні посилання лише https', () => {
    expect(menuHref({ target_type: 'url', target_ref: 'https://example.com' })).toBe('https://example.com');
    expect(menuHref({ target_type: 'url', target_ref: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('visibleMenu', () => {
  const items = [
    item({ name: 'Налаштування', target_ref: 'settings', sort_order: 10, required_permission: 'settings.manage' }),
    item({ name: 'Dashboard', target_ref: 'dashboard', sort_order: 1, required_permission: 'analytics.read' }),
    item({ name: 'Кандидати', target_ref: 'candidates', sort_order: 2, required_permission: 'candidates.read' }),
    item({ name: 'Конструктор', target_ref: 'builder', sort_order: 11, required_permission: 'builder.edit', admin_only: true }),
    item({ name: 'Прихований', target_ref: 'reports', sort_order: 3, is_visible: false }),
  ];

  it('рекрутер бачить лише дозволені розділи в правильному порядку', () => {
    const perms = toPermissions([
      { permission_code: 'analytics.read', scope: 'all' },
      { permission_code: 'candidates.read', scope: 'all' },
    ]);
    expect(visibleMenu(items, perms).map((m) => m.name)).toEqual(['Dashboard', 'Кандидати']);
  });

  it('адміністратор бачить конструктор', () => {
    const perms = toPermissions(
      ['analytics.read', 'candidates.read', 'settings.manage', 'builder.edit'].map((c) => ({ permission_code: c, scope: 'all' })),
    );
    expect(visibleMenu(items, perms).map((m) => m.href)).toEqual(['/', '/candidates', '/settings', '/builder']);
  });

  it('без прав меню порожнє', () => {
    expect(visibleMenu(items, {})).toEqual([]);
  });
});
