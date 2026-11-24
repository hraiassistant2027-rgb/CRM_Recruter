'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { dictionaryItemSchema, uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import type { FormState } from '@/lib/form-state';

const KINDS = {
  sites: { table: 'sites', extra: 'address' },
  departments: { table: 'departments', extra: null },
  sources: { table: 'sources', extra: null },
  company_reasons: { table: 'rejection_reasons', extra: null, side: 'company' },
  candidate_reasons: { table: 'rejection_reasons', extra: null, side: 'candidate' },
} as const;
type Kind = keyof typeof KINDS;

function kindOf(v: FormDataEntryValue | null): Kind | null {
  return typeof v === 'string' && v in KINDS ? (v as Kind) : null;
}

export async function addDictionaryItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const kind = kindOf(formData.get('kind'));
  if (!kind) return { error: 'Невідомий довідник' };
  const parsed = dictionaryItemSchema.safeParse({ name: formData.get('name'), extra: formData.get('extra') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте дані' };
  const cfg = KINDS[kind];
  const row: Record<string, string | null> = { name: parsed.data.name };
  if (cfg.extra) row[cfg.extra] = parsed.data.extra;
  if ('side' in cfg) row.side = cfg.side;

  const supabase = await createClient();
  const { error } = await supabase.from(cfg.table).insert(row);
  if (error) return { error: error.code === '23505' ? 'Такий запис уже є' : translateError(error) };
  revalidatePath('/settings/dictionaries');
  return { ok: `Додано: ${parsed.data.name}` };
}

export async function setDictionaryItemActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const kind = kindOf(formData.get('kind'));
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!kind || !id.success) return { error: 'Невірний запис' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(KINDS[kind].table)
    .update({ is_active: formData.get('active') === 'true' })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  revalidatePath('/settings/dictionaries');
  return { ok: 'Збережено' };
}

export async function updateStage(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) return { error: 'Невірний етап' };
  const name = String(formData.get('name') ?? '').trim();
  const color = String(formData.get('color') ?? '').trim();
  const slaRaw = String(formData.get('sla_days') ?? '').trim();
  if (name.length < 2 || name.length > 60) return { error: 'Назва етапу — від 2 до 60 символів' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Невірний колір' };
  const sla = slaRaw === '' ? null : Number(slaRaw);
  if (sla !== null && (!Number.isInteger(sla) || sla < 1 || sla > 365)) return { error: 'Норма днів — ціле число від 1 до 365' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pipeline_stages')
    .update({ name, color, sla_days: sla, is_active: formData.get('is_active') === 'on' })
    .eq('id', id.data)
    .select('id');
  if (error) return { error: translateError(error) };
  if (!data?.length) return { error: 'Немає права на цю дію' };
  revalidatePath('/settings/pipeline');
  revalidatePath('/pipeline');
  return { ok: 'Етап збережено' };
}

export async function moveStage(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuidSchema.safeParse(formData.get('id'));
  const dir = formData.get('dir') === 'up' ? 'up' : 'down';
  if (!id.success) return { error: 'Невірний етап' };
  const supabase = await createClient();
  const { data: stage } = await supabase.from('pipeline_stages').select('id, pipeline_id, sort_order').eq('id', id.data).maybeSingle();
  if (!stage) return { error: 'Етап не знайдено' };
  let q = supabase.from('pipeline_stages').select('id').eq('pipeline_id', stage.pipeline_id);
  q = dir === 'up' ? q.lt('sort_order', stage.sort_order).order('sort_order', { ascending: false }) : q.gt('sort_order', stage.sort_order).order('sort_order');
  const { data: neighbour } = await q.limit(1).maybeSingle();
  if (!neighbour) return { ok: 'Етап уже на краю списку' };
  const { error } = await supabase.rpc('swap_stage_order', { p_a: stage.id, p_b: neighbour.id });
  if (error) return { error: translateError(error) };
  revalidatePath('/settings/pipeline');
  revalidatePath('/pipeline');
  revalidatePath('/vacancies', 'layout');
  return { ok: 'Порядок змінено' };
}
