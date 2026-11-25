// Поля, які адміністратор додав у конструкторі. Без власного стану — працює в будь-якій формі.
import { CUSTOM_MARKER, formatCustomValue, inputName, type CustomValues, type FieldDef } from '@/lib/custom-fields';

const base =
  'block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/30';

export function CustomFieldInputs({
  fields,
  values,
  errors,
  title = 'Додаткові поля',
}: {
  fields: FieldDef[];
  values?: CustomValues | null;
  errors?: Record<string, string>;
  title?: string;
}) {
  const active = fields.filter((f) => !f.archived_at);
  if (active.length === 0) return null;
  const v = values ?? {};
  return (
    <section className="space-y-4">
      <input type="hidden" name={CUSTOM_MARKER} value="1" />
      <h2 className="font-semibold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {active.map((f) => {
          const name = inputName(f.code);
          const err = errors?.[name];
          const current = v[f.code];
          const label = `${f.name}${f.is_required ? ' *' : ''}`;
          const wide = f.type === 'long_text' || f.type === 'multiselect';
          let control: React.ReactNode;
          switch (f.type) {
            case 'long_text':
              control = <textarea id={name} name={name} rows={4} defaultValue={typeof current === 'string' ? current : ''} className={base} />;
              break;
            case 'boolean':
              control = (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" id={name} name={name} defaultChecked={current === true} className="h-4 w-4 accent-[var(--color-accent-strong)]" />
                  Так
                </label>
              );
              break;
            case 'select':
              control = (
                <select id={name} name={name} defaultValue={typeof current === 'string' ? current : ''} className={base}>
                  <option value="">— не вказано —</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  {typeof current === 'string' && current && !f.options.includes(current) && <option value={current}>{current} (старий варіант)</option>}
                </select>
              );
              break;
            case 'multiselect': {
              const picked = Array.isArray(current) ? current : [];
              control = (
                <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-line bg-white px-3 py-2">
                  {f.options.map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name={name} value={o} defaultChecked={picked.includes(o)} className="h-4 w-4 accent-[var(--color-accent-strong)]" />
                      {o}
                    </label>
                  ))}
                </div>
              );
              break;
            }
            default: {
              const type = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : f.type === 'phone' ? 'tel' : 'text';
              control = (
                <input
                  id={name}
                  name={name}
                  type={type}
                  inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : undefined}
                  defaultValue={current === null || current === undefined || typeof current === 'boolean' ? '' : String(current)}
                  placeholder={f.type === 'url' ? 'https://…' : undefined}
                  className={base}
                />
              );
            }
          }
          return (
            <div key={f.id} className={wide ? 'md:col-span-2' : undefined}>
              {f.type === 'boolean' || f.type === 'multiselect' ? (
                <span className="mb-1.5 block text-sm font-medium">{label}</span>
              ) : (
                <label htmlFor={name} className="mb-1.5 block text-sm font-medium">{label}</label>
              )}
              {control}
              {f.help_text && <p className="mt-1 text-xs text-ink-soft">{f.help_text}</p>}
              {err && <p className="mt-1 text-xs text-danger">{err}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Показ значень у картці (архівні поля не показуються; посилання і email — клікабельні)
export function CustomFieldValues({ fields, values }: { fields: FieldDef[]; values?: CustomValues | null }) {
  const active = fields.filter((f) => !f.archived_at);
  if (active.length === 0) return null;
  const v = values ?? {};
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {active.map((f) => {
        const value = v[f.code];
        const text = formatCustomValue(f, value);
        return (
          <div key={f.id} className={f.type === 'long_text' ? 'sm:col-span-2' : undefined}>
            <dt className="text-xs text-ink-soft">{f.name}</dt>
            <dd className={`whitespace-pre-line break-words ${text === '—' ? 'text-ink-soft' : ''}`}>
              {f.type === 'url' && typeof value === 'string' && value ? (
                <a href={value} target="_blank" rel="noopener noreferrer" className="underline">{value}</a>
              ) : f.type === 'email' && typeof value === 'string' && value ? (
                <a href={`mailto:${value}`} className="underline">{value}</a>
              ) : (
                text
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
