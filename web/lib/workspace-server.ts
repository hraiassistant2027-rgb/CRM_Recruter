import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isWorkspaceCode, WORKSPACES, type WorkspaceCode } from './workspace';

export type WorkspaceInfo = { id: string; code: WorkspaceCode; name: string; icon: string; theme: string };

// Поточний простір і доступні користувачу (Супер адміністратор / Адміністратор — усі)
export const getWorkspaces = cache(async (): Promise<{ current: WorkspaceInfo | null; list: WorkspaceInfo[] }> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_workspaces');
  const rows = ((data ?? []) as { id: string; code: string; name: string; is_current: boolean }[]).filter((w) => isWorkspaceCode(w.code));
  const list = rows.map((w) => ({ id: w.id, code: w.code as WorkspaceCode, name: w.name, icon: WORKSPACES[w.code as WorkspaceCode].icon, theme: WORKSPACES[w.code as WorkspaceCode].theme }));
  const cur = rows.find((w) => w.is_current);
  return { current: cur ? list.find((w) => w.id === cur.id) ?? null : null, list };
});
