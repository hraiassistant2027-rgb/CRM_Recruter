'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { translateError } from '@/lib/errors';
import { uuidSchema } from '@/lib/validation';
import { FIELD_TYPE_LABELS } from '@/lib/custom-fields';
import type { FormState } from '@/lib/form-state';

function refresh() {
  revalidatePath('/builder');
  revalidatePath('/candidates', 'layout');
  revalidatePath('/vacancies', 'layout');
}

export async function saveField(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission('builder.edit');
  const idRaw = String(formData.get('id') ?? '');
  const id = idRaw ? uuidSchema.safeParse(idRaw) : null;
  if (id && !id.success) return { error: 'Невірне поле' };
  const entity = formData.get('entity') === 'vacancies' ? 'vacancies' : 'candidates';
  const type = String(formData.get('type') ?? '');
  if (!(type in FIELD_TYPE_LABELS)) return { error: 'Оберіть тип поля' };
  const options = String(formData.get('options') ?? '')
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase.rpc('builder_save_field', {
    p_id: id?.success ? id.data : null,
    p_entity: entity,
    p_name: String(formData.get('name') ?? ''),
    p_type: type,
    p_required: formData.get('is_required') === 'on',
    p_options: options,
    p_help: String(formData.get('help_text') ?? '').trim() || null,
    p_show_in_list: formData.get('show_in_list') === 'on',
  });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: id ? 'Поле збережено' : 'Поле додано' };
}

export async function moveField(fieldId: string, up: boolean): Promise<FormState> {
  await requirePermission('builder.edit');
  if (!uuidSchema.safeParse(fieldId).success) return { error: 'Невірне поле' };
  const { error } = await (await createClient()).rpc('builder_move_field', { p_id: fieldId, p_up: up });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: 'Порядок змінено' };
}

export async function archiveField(fieldId: string, archived: boolean): Promise<FormState> {
  await requirePermission('builder.edit');
  if (!uuidSchema.safeParse(fieldId).success) return { error: 'Невірне поле' };
  const { error } = await (await createClient()).rpc('builder_archive_field', { p_id: fieldId, p_archived: archived });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: archived ? 'Поле приховано' : 'Поле повернуто' };
}
