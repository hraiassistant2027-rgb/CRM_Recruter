'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation';
import { translateError } from '@/lib/errors';
import { textToHtml } from '@/lib/email';
import type { FormState } from '@/lib/form-state';

const templateSchema = z.object({
  name: z.string().trim().min(2, 'Вкажіть назву').max(120, 'Задовга назва'),
  category: z.enum(['invite', 'next_stage', 'rejection', 'received', 'offer', 'custom'], { message: 'Оберіть тип' }),
  subject: z.string().trim().min(2, 'Вкажіть тему').max(300, 'Задовга тема'),
  body: z.string().trim().min(5, 'Текст закороткий').max(20000, 'Задовгий текст'),
  is_active: z.boolean(),
});

export async function saveTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = templateSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    subject: formData.get('subject'),
    body: formData.get('body'),
    is_active: formData.get('is_active') === 'on',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Перевірте дані' };
  const t = parsed.data;
  const variables = [...new Set([...`${t.subject}\n${t.body}`.matchAll(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
  const row = { name: t.name, category: t.category, subject: t.subject, body_html: textToHtml(t.body), variables, is_active: t.is_active };

  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  if (id) {
    if (!uuidSchema.safeParse(id).success) return { error: 'Невірний шаблон' };
    const { data, error } = await supabase.from('email_templates').update(row).eq('id', id).select('id');
    if (error) return { error: error.code === '23505' ? 'Шаблон з такою назвою вже є' : translateError(error) };
    if (!data?.length) return { error: 'Немає права на цю дію' };
  } else {
    const { error } = await supabase.from('email_templates').insert(row);
    if (error) return { error: error.code === '23505' ? 'Шаблон з такою назвою вже є' : translateError(error) };
  }
  revalidatePath('/templates');
  redirect('/templates?saved=1');
}
