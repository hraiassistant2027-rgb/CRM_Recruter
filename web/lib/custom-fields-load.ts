import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { FIELD_COLUMNS, type FieldDef } from './custom-fields';

type Supa = Awaited<ReturnType<typeof createClient>>;

// Власні поля картки: «candidates» або «vacancies»
export async function loadFields(supabase: Supa, entity: 'candidates' | 'vacancies', includeArchived = false): Promise<FieldDef[]> {
  const { data: ent } = await supabase.from('entities').select('id').eq('code', entity).maybeSingle();
  if (!ent) return [];
  let q = supabase.from('fields').select(FIELD_COLUMNS).eq('entity_id', ent.id).eq('is_system', false).order('sort_order').order('id');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data } = await q;
  return ((data ?? []) as FieldDef[]).map((f) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] }));
}
