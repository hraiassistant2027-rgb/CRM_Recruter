// Вибір юрособи кольором (назви юросіб показуються лише в Налаштування → Довідники).
// Звичайні radio-кнопки, тож працює і в формах без JavaScript (фільтр звіту), і у формі вакансії.
export function EntityColorPicker({
  name,
  entities,
  defaultValue,
  emptyLabel,
}: {
  name: string;
  entities: { id: string; color: string }[];
  defaultValue: string;
  emptyLabel: string;
}) {
  const box =
    'flex h-9 items-center justify-center rounded-lg border border-line bg-white px-2 has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-ink/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-strong cursor-pointer';
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      <label className={`${box} text-xs text-ink-soft`}>
        <input type="radio" name={name} value="" defaultChecked={!defaultValue} className="sr-only" />
        {emptyLabel}
      </label>
      {entities.map((e, i) => (
        <label key={e.id} className={`${box} w-9 px-0`}>
          <input type="radio" name={name} value={e.id} defaultChecked={defaultValue === e.id} className="sr-only" aria-label={`Колір ${i + 1}`} />
          <span className="h-5 w-5 rounded" style={{ background: e.color }} aria-hidden />
        </label>
      ))}
    </div>
  );
}
