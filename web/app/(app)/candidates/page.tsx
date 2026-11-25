import type { Metadata } from 'next';
import { loadFields } from '@/lib/custom-fields-load';
import { formatCustomValue, type CustomValues } from '@/lib/custom-fields';
import Link from 'next/link';
import { Plus, Search, Upload } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/permissions';
import { Alert, Badge, Card, Input, PageHeader, Select } from '@/components/ui';
import { MATCH_LABELS, formatDate } from '@/lib/candidates';

export const metadata: Metadata = { title: 'База кандидатів' };

const PAGE_SIZE = 50;

type SearchRow = {
  id: string;
  full_name: string;
  current_position: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  source_id: string | null;
  owner_id: string | null;
  review_status: string;
  updated_at: string;
  deleted_at: string | null;
  matched_in: string | null;
  total_count: number;
};

type Params = { q?: string; city?: string; source?: string; mine?: string; review?: string; trash?: string; page?: string };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('candidates.read');
  const sp = await searchParams;
  const params: Params = {
    q: one(sp.q)?.slice(0, 200),
    city: one(sp.city)?.slice(0, 100),
    source: one(sp.source),
    mine: one(sp.mine),
    review: one(sp.review),
    trash: one(sp.trash),
    page: one(sp.page),
  };
  const canTrash = can(session.permissions, 'candidates.restore');
  const trash = canTrash && params.trash === '1';
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1));
  const source = params.source && /^[0-9a-f-]{36}$/i.test(params.source) ? params.source : null;
  const review = params.review === 'unreviewed' || params.review === 'reviewed' ? params.review : null;

  const supabase = await createClient();
  const [{ data, error }, { data: sources }, { data: owners }] = await Promise.all([
    supabase.rpc('search_candidates', {
      p_query: params.q || null,
      p_city: params.city || null,
      p_source_id: source,
      p_owner_id: params.mine === '1' ? session.userId : null,
      p_review_status: review,
      p_deleted: trash,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from('sources').select('id, name').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('id, full_name'),
  ]);
  const rows = (data ?? []) as SearchRow[];
  // Власні поля, які адміністратор позначив «показувати в списку»
  const listFields = (await loadFields(supabase, 'candidates')).filter((f) => f.show_in_list).slice(0, 4);
  const customById = new Map<string, CustomValues>();
  if (listFields.length && rows.length) {
    const { data: cv } = await supabase.from('candidates').select('id, custom').in('id', rows.map((r) => r.id));
    for (const row of (cv ?? []) as { id: string; custom: CustomValues | null }[]) customById.set(row.id, row.custom ?? {});
  }
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sourceName = new Map((sources ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
  const ownerName = new Map((owners ?? []).map((o: { id: string; full_name: string }) => [o.id, o.full_name]));
  const filtered = Boolean(params.q || params.city || source || params.mine === '1' || review);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') qs.set(k, v);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return `/candidates${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title={trash ? 'Кошик кандидатів' : 'База кандидатів'}
        description={trash ? 'Видалені картки. Їх можна відкрити і відновити.' : 'Єдина база для всіх вакансій'}
        actions={
          can(session.permissions, 'candidates.create') && !trash ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/candidates/import"
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-surface"
              >
                <Upload className="h-4 w-4" aria-hidden /> Кілька резюме
              </Link>
              <Link
                href="/candidates/new"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink hover:bg-accent-strong"
              >
                <Plus className="h-4 w-4" aria-hidden /> Додати кандидата
              </Link>
            </div>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
          {trash && <input type="hidden" name="trash" value="1" />}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Пошук</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-soft" aria-hidden />
              <Input name="q" defaultValue={params.q} placeholder="ПІБ, посада, навичка, телефон, email, текст резюме" className="pl-9" />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Місто</span>
            <Input name="city" defaultValue={params.city} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Джерело</span>
            <Select name="source" defaultValue={source ?? ''}>
              <option value="">Усі</option>
              {(sources ?? []).map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Статус</span>
            <Select name="review" defaultValue={review ?? ''}>
              <option value="">Усі</option>
              <option value="unreviewed">Не перевірені (з імпорту)</option>
              <option value="reviewed">Перевірені</option>
            </Select>
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">
              Знайти
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-5">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="mine" value="1" defaultChecked={params.mine === '1'} className="accent-[var(--color-accent-strong)]" />
              Лише мої кандидати
            </label>
            {filtered && (
              <Link href={trash ? '/candidates?trash=1' : '/candidates'} className="text-ink-soft underline">
                Скинути фільтри
              </Link>
            )}
            {canTrash && (
              <Link href={trash ? '/candidates' : '/candidates?trash=1'} className="ml-auto text-ink-soft underline">
                {trash ? '← До бази' : 'Кошик'}
              </Link>
            )}
          </div>
        </form>
      </Card>

      {error && <Alert>Не вдалося виконати пошук. Спробуйте змінити запит.</Alert>}

      <p className="mb-2 text-sm text-ink-soft">
        {total === 0 ? 'Нічого не знайдено' : `Знайдено: ${new Intl.NumberFormat('uk-UA').format(total)}`}
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Кандидат</th>
                <th className="px-4 py-3 font-medium">Місто</th>
                <th className="px-4 py-3 font-medium">Контакти</th>
                <th className="px-4 py-3 font-medium">Джерело</th>
                <th className="px-4 py-3 font-medium">Відповідальний</th>
                {listFields.map((f) => (
                  <th key={f.id} className="px-4 py-3 font-medium">{f.name}</th>
                ))}
                <th className="px-4 py-3 font-medium">Оновлено</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${r.id}`} className="font-medium hover:underline">
                      {r.full_name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
                      {r.current_position && <span>{r.current_position}</span>}
                      {r.review_status === 'unreviewed' && <Badge tone="warn">не перевірено</Badge>}
                      {r.matched_in && r.matched_in !== 'profile' && <Badge>збіг: {MATCH_LABELS[r.matched_in] ?? r.matched_in}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.city ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    <div>{r.phone ?? ''}</div>
                    <div className="text-ink-soft">{r.email ?? ''}</div>
                  </td>
                  <td className="px-4 py-3">{(r.source_id && sourceName.get(r.source_id)) || '—'}</td>
                  <td className="px-4 py-3">{(r.owner_id && ownerName.get(r.owner_id)) || '—'}</td>
                  {listFields.map((f) => (
                    <td key={f.id} className="px-4 py-3 text-xs">{formatCustomValue(f, customById.get(r.id)?.[f.code])}</td>
                  ))}
                  <td className="px-4 py-3 text-xs text-ink-soft">{formatDate(trash ? r.deleted_at : r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Сторінки">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="underline">
              ← Попередня
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-soft">
            Сторінка {page} з {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="underline">
              Наступна →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
