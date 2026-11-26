'use client';
import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { saveTemplate } from './actions';
import { Alert, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { initialFormState } from '@/lib/form-state';
import { VARIABLE_LABELS } from '@/lib/email';
import { CATEGORY_LABELS } from './labels';

export function TemplateForm({
  template,
}: {
  template?: { id: string; name: string; category: string; subject: string; body: string; is_active: boolean };
}) {
  const [state, action] = useActionState(saveTemplate, initialFormState);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const token = `{{${key}}}`;
    const start = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, start) + token + el.value.slice(el.selectionEnd ?? start);
    el.focus();
    el.selectionStart = el.selectionEnd = start + token.length;
  };
  return (
    <form action={action} className="space-y-4">
      {template && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Назва шаблону" htmlFor="name">
          <Input id="name" name="name" defaultValue={template?.name} />
        </Field>
        <Field label="Тип" htmlFor="category">
          <Select id="category" name="category" defaultValue={template?.category ?? 'custom'}>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Тема листа" htmlFor="subject">
        <Input id="subject" name="subject" defaultValue={template?.subject} />
      </Field>
      <Field label="Текст" htmlFor="body" hint="Порожній рядок — новий абзац. Змінні в подвійних фігурних дужках підставляються автоматично.">
        <textarea
          ref={bodyRef}
          id="body"
          name="body"
          rows={12}
          defaultValue={template?.body}
          className="block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 font-mono text-sm focus:border-accent-strong focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent/15"
        />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">Вставити змінну в текст:</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(VARIABLE_LABELS).map(([key, label]) => (
            <button key={key} type="button" onClick={() => insert(key)} className="rounded-md border border-line bg-white px-2 py-1 text-xs hover:bg-surface">
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={template?.is_active ?? true} className="accent-[var(--color-accent-strong)]" />
        Активний (доступний у списку шаблонів)
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-3">
        <SubmitButton pendingText="Зберігаємо…">Зберегти шаблон</SubmitButton>
        <Link href="/templates" className="inline-flex items-center px-3 text-sm text-ink-soft underline">
          Скасувати
        </Link>
      </div>
    </form>
  );
}
