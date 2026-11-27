'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

const CONTACT = ['call', 'phone', 'manager', 'repeat', 'polygraph', 'offer', 'start'];

function refresh() {
  revalidatePath('/settings/pipeline');
  revalidatePath('/pipeline');
  revalidatePath('/vacancies', 'layout');
}

export type StagePatch = { name?: string; color?: string; sla_days?: number | null; is_active?: boolean; contact_kind?: string | null };

// Зміни етапу зберігаються одразу (без кнопки «Зберегти»)
export async function saveStage(id: string, patch: StagePatch): Promise<FormState> {
  if (!uuidSchema.safeParse(id).success) return { error: 'Невірний етап' };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2 || name.length > 60) return { error: 'Назва етапу — від 2 до 60 символів' };
    row.name = name;
  }
  if (patch.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(patch.color)) return { error: 'Невірний колір' };
    row.color = patch.color;
  }
  if (patch.sla_days !== undefined) {
    if (patch.sla_days !== null && (!Number.isInteger(patch.sla_days) || patch.sla_days < 1 || patch.sla_days > 365)) return { error: 'Норма днів — ціле число від 1 до 365' };
    row.sla_days = patch.sla_days;
  }
  if (patch.is_active !== undefined) row.is_active = patch.is_active;
  if (patch.contact_kind !== undefined) {
    if (patch.contact_kind !== null && !CONTACT.includes(patch.contact_kind)) return { error: 'Невідомий тип контакту' };
    row.contact_kind = patch.contact_kind;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('pipeline_stages').update(row).eq('id', id).select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  refresh();
  return { ok: 'Збережено' };
}

export async function moveStageDir(id: string, dir: 'up' | 'down'): Promise<FormState> {
  if (!uuidSchema.safeParse(id).success) return { error: 'Невірний етап' };
  const supabase = await createClient();
  const { data: stage } = await supabase.from('pipeline_stages').select('id, pipeline_id, sort_order').eq('id', id).maybeSingle();
  if (!stage) return { error: 'Етап не знайдено' };
  let q = supabase.from('pipeline_stages').select('id').eq('pipeline_id', stage.pipeline_id).is('archived_at', null);
  q = dir === 'up' ? q.lt('sort_order', stage.sort_order).order('sort_order', { ascending: false }) : q.gt('sort_order', stage.sort_order).order('sort_order');
  const { data: neighbour } = await q.limit(1).maybeSingle();
  if (!neighbour) return { ok: 'Етап уже на краю списку' };
  const { error } = await supabase.rpc('swap_stage_order', { p_a: stage.id, p_b: neighbour.id });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: 'Порядок змінено' };
}

export async function addStage(input: { name: string; color: string; sla_days: number | null; contact_kind: string | null; after: string | null }): Promise<FormState> {
  if (input.contact_kind && !CONTACT.includes(input.contact_kind)) return { error: 'Невідомий тип контакту' };
  if (input.after && !uuidSchema.safeParse(input.after).success) return { error: 'Невірна позиція' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_pipeline_stage', {
    p_name: input.name,
    p_color: input.color,
    p_sla: input.sla_days,
    p_contact_kind: input.contact_kind,
    p_after: input.after,
  });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: `Етап «${input.name.trim()}» додано` };
}

export async function deleteStage(id: string): Promise<FormState> {
  if (!uuidSchema.safeParse(id).success) return { error: 'Невірний етап' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_pipeline_stage', { p_id: id });
  if (error) return { error: translateError(error) };
  refresh();
  return { ok: data === 'archived' ? 'Етап прибрано (історія кандидатів на ньому збережена)' : 'Етап видалено' };
}
