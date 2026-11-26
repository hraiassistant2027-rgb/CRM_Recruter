// Простори CRM: KAN Talent і HomeHub (управляюча компанія). Окремі бази в одній CRM.
export type WorkspaceCode = 'kan' | 'homehub';

export const WORKSPACES: Record<WorkspaceCode, { name: string; short: string; icon: string; theme: string }> = {
  kan: { name: 'KAN Talent', short: 'KAN', icon: '/logo-icon.png', theme: 'kan' },
  homehub: { name: 'HomeHub', short: 'HomeHub', icon: '/homehub-icon.png', theme: 'homehub' },
};

export const WORKSPACE_COOKIE = 'kt_ws';

export function isWorkspaceCode(v: unknown): v is WorkspaceCode {
  return v === 'kan' || v === 'homehub';
}

// Перехід в інший простір: сервер ставить cookie і відкриває потрібну сторінку
export function switchHref(to: WorkspaceCode, next = '/'): string {
  return `/api/workspace?to=${to}&next=${encodeURIComponent(next)}`;
}
