'use server';
import { requireSession } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { isWorkspaceCode } from '@/lib/workspace';
import { uuidSchema } from '@/lib/validation';
import type { Overview } from '@/components/dashboard-types';

// Дані воронки, відмов і джерел для одного блоку дашборда (фільтр «Для вакансії» без перезавантаження сторінки)
export async function loadOverview(ws: string, vacancy: string | null): Promise<{ data?: Overview; error?: string }> {
  const session = await requireSession();
  if (!(can(session.permissions, 'analytics.read') || can(session.permissions, 'applications.read'))) return { error: 'Немає доступу' };
  if (!isWorkspaceCode(ws)) return { error: 'Невідомий простір' };
  if (vacancy && !uuidSchema.safeParse(vacancy).success) return { error: 'Невірна вакансія' };
  const sb = await createClient({ workspace: ws });
  const { data, error } = await sb.rpc('dashboard_overview', { p_vacancy: vacancy });
  if (error || !data) return { error: 'Не вдалося оновити дані' };
  return { data: data as Overview };
}
