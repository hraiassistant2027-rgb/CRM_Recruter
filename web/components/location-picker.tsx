'use client';
import { useEffect, useState } from 'react';
import { Field, Input, Select } from '@/components/ui';

export type Site = { id: string; name: string; address: string | null };
export type LocationMode = 'phone' | 'office' | 'site' | 'online';
export type LocationValue = { mode: LocationMode; location: string; meet: boolean };

const OFFICE_KEY = 'kan.office.address';

// Де проводиться контакт: телефоном, в офісі, на об'єкті або онлайн (Google Meet)
export function LocationPicker({
  sites,
  defaultMode,
  defaultSiteId,
  googleReady,
  onChange,
  idPrefix = 'loc',
}: {
  sites: Site[];
  defaultMode: LocationMode;
  defaultSiteId?: string | null;
  googleReady: boolean;
  onChange: (value: LocationValue) => void;
  idPrefix?: string;
}) {
  const [mode, setMode] = useState<LocationMode>(defaultMode);
  const [office, setOffice] = useState('');
  const [siteId, setSiteId] = useState(defaultSiteId ?? sites[0]?.id ?? '');
  const [details, setDetails] = useState('');

  useEffect(() => {
    try {
      setOffice(localStorage.getItem(OFFICE_KEY) ?? '');
    } catch {
      /* сховище браузера недоступне */
    }
  }, []);

  useEffect(() => {
    const site = sites.find((s) => s.id === siteId);
    let location = '';
    if (mode === 'phone') location = 'Телефоном';
    if (mode === 'office') location = `Офіс${office.trim() ? `: ${office.trim()}` : ''}`;
    if (mode === 'site') location = site ? `Об'єкт: ${site.name}${site.address ? `, ${site.address}` : ''}` : "Об'єкт";
    if (mode === 'online') location = 'Онлайн (Google Meet)';
    if (details.trim()) location += ` — ${details.trim()}`;
    onChange({ mode, location, meet: mode === 'online' });
    if (mode === 'office' && office.trim()) {
      try {
        localStorage.setItem(OFFICE_KEY, office.trim());
      } catch {
        /* сховище браузера недоступне */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, office, siteId, details]);

  return (
    <div className="space-y-3">
      <Field label="Де проводиться" htmlFor={`${idPrefix}-mode`}>
        <Select id={`${idPrefix}-mode`} value={mode} onChange={(e) => setMode(e.target.value as LocationMode)}>
          <option value="phone">Телефоном</option>
          <option value="office">Офіс</option>
          <option value="site">Об’єкт (будівництво)</option>
          <option value="online">Онлайн — Google Meet</option>
        </Select>
      </Field>
      {mode === 'office' && (
        <Field label="Адреса офісу" htmlFor={`${idPrefix}-office`} hint="Запам’ятовується для наступних разів">
          <Input id={`${idPrefix}-office`} value={office} onChange={(e) => setOffice(e.target.value)} placeholder="м. Київ, вул. …, поверх, кабінет" />
        </Field>
      )}
      {mode === 'site' &&
        (sites.length ? (
          <Field label="Об’єкт" htmlFor={`${idPrefix}-site`}>
            <Select id={`${idPrefix}-site`} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.address ? ` — ${s.address}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-xs text-ink-soft">Список об’єктів порожній — додайте їх у Налаштування → Довідники. Поки можна вказати адресу в уточненні нижче.</p>
        ))}
      {mode === 'online' && (
        <p className={`rounded-lg px-3 py-2 text-xs ${googleReady ? 'bg-accent-soft text-ink' : 'bg-danger-soft text-danger'}`}>
          {googleReady
            ? 'Посилання Google Meet створиться автоматично. Кандидат отримає його в запрошенні з календаря, а після збереження CRM запропонує ще й лист із посиланням.'
            : 'Для онлайн-зустрічі підключіть Google у своєму профілі — інакше посилання Meet не створиться.'}
        </p>
      )}
      <Field label="Уточнення (необов’язково)" htmlFor={`${idPrefix}-details`}>
        <Input id={`${idPrefix}-details`} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Поверх, кабінет, з ким зустрітися, що взяти" />
      </Field>
    </div>
  );
}
