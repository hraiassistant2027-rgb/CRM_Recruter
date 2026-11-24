import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { loadAgenda, type AgendaItem } from '@/lib/interviews-load';
import { KIND_COLORS, KIND_LABELS, STATUS_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatTime, kyivToDate, todayKyiv, weekStart } from '@/lib/time';
import { DayListButton, type DayList } from '@/components/day-list';

export const metadata: Metadata = { title: 'Календар' };

// Кольори полів у події — однакові всюди, щоб око швидко знаходило потрібне
const C = {
  candidate: '#1A1A7A', // кандидат — темно-синій
  position: '#B45309', // посада — бурштиновий
  phone: '#15803D', // телефон — зелений
  recruiter: '#BE185D', // рекрутер — малиновий
};

const HOUR_PX = 64;
const DAY_HEAD = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const RANGE = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function minutesOfDay(iso: string): number {
  const { time } = dateToKyiv(iso);
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Розкладка подій дня по «доріжках», щоб події, що перетинаються, стояли поруч
function layout(items: AgendaItem[]) {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const lanesEnd: number[] = [];
  const placed = sorted.map((item) => {
    const start = minutesOfDay(item.starts_at);
    const end = Math.max(start + 15, start + Math.round((new Date(item.ends_at).getTime() - new Date(item.starts_at).getTime()) / 60000));
    let lane = lanesEnd.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(end);
    } else lanesEnd[lane] = end;
    return { item, start, end, lane };
  });
  const lanes = Math.max(1, lanesEnd.length);
  return placed.map((p) => ({ ...p, lanes }));
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('applications.read');
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const today = todayKyiv();
  const week = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(one('week') ?? '') ? one('week')! : today);
  const all = one('all') === '1';
  const from = kyivToDate(week, '00:00')!;
  const to = kyivToDate(addDays(week, 7), '00:00')!;

  const supabase = await createClient();
  const items = await loadAgenda(supabase, from.toISOString(), to.toISOString(), all ? undefined : session.userId);
  const { data: users } = await supabase.from('profiles').select('id, full_name');
  const nameOf = new Map(((users ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  // Субота і неділя показуються лише тоді, коли на них є зустрічі
  const days = allDays.filter((d, i) => i < 5 || items.some((it) => dateToKyiv(it.starts_at).date === d));

  // Текстові списки зустрічей по днях — для керівника
  const LIST_DAY = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dayLists: DayList[] = allDays.map((d) => {
    const list = items.filter((it) => dateToKyiv(it.starts_at).date === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const label = LIST_DAY.format(new Date(`${d}T00:00:00Z`));
    const lines = list.map((it) => {
      const contact = it.meet_link ? `Google Meet: ${it.meet_link}` : it.candidate_phone ?? 'тел. не вказано';
      const recruiter = it.recruiter_id ? nameOf.get(it.recruiter_id) ?? '' : '';
      return `${formatTime(it.starts_at)} — ${it.candidate_name} / ${it.vacancy_title} / ${contact} / ${recruiter}`;
    });
    return { date: d, label, count: list.length, text: `Зустрічі на ${label}\n\n${lines.join('\n')}` };
  });
  const href = (w: string, a = all) => `/calendar?week=${w}${a ? '&all=1' : ''}`;

  // Видимі години: 08–20 або ширше, якщо є події раніше/пізніше
  const starts = items.map((i) => minutesOfDay(i.starts_at));
  const ends = items.map((i) => minutesOfDay(i.ends_at) || 24 * 60);
  const firstHour = Math.min(8, ...starts.map((m) => Math.floor(m / 60)));
  const lastHour = Math.max(20, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR_PX;

  return (
    <>
      <PageHeader title="Календар контактів і співбесід" description="Кожен дзвінок, співбесіда й зустріч щодо оффера — на своїй даті й годині" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={href(addDays(week, -7))} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface">
              ← Попередній
            </Link>
            <span className="font-medium">
              {RANGE.format(new Date(`${week}T00:00:00Z`))} — {RANGE.format(new Date(`${addDays(week, 4)}T00:00:00Z`))}
            </span>
            <Link href={href(addDays(week, 7))} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface">
              Наступний →
            </Link>
            {week !== weekStart(today) && (
              <Link href={href(weekStart(today))} className="underline">
                Сьогодні
              </Link>
            )}
          </div>
          <div className="flex gap-3">
            <Link href={href(week, false)} className={all ? 'text-ink-soft underline' : 'font-medium underline'}>
              Мої
            </Link>
            <Link href={href(week, true)} className={all ? 'font-medium underline' : 'text-ink-soft underline'}>
              Усі доступні
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="font-semibold" style={{ color: C.candidate }}>■ Кандидат</span>
          <span className="font-medium" style={{ color: C.position }}>■ Посада</span>
          <span className="font-medium" style={{ color: C.phone }}>■ Телефон кандидата</span>
          <span className="font-medium" style={{ color: C.recruiter }}>■ Рекрутер</span>
          <span className="text-ink-soft">Смуга зліва — тип контакту:</span>
          {Object.entries(KIND_LABELS)
            .filter(([k]) => k !== 'other')
            .map(([k, label]) => (
              <span key={k} className="inline-flex items-center gap-1 text-ink-soft">
                <span className="inline-block h-3 w-1.5 rounded-sm" style={{ backgroundColor: KIND_COLORS[k] }} />
                {label}
              </span>
            ))}
        </div>
      </Card>

      <div className="mb-4">
        <DayListButton days={dayLists} defaultDate={today} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <div className={days.length > 5 ? 'min-w-[1050px]' : 'min-w-[800px]'}>
          <div className="grid border-b border-line bg-surface text-xs" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d} className={`border-l border-line px-2 py-2 text-center ${d === today ? 'bg-accent-soft font-semibold' : 'font-medium'}`}>
                {DAY_HEAD.format(new Date(`${d}T00:00:00Z`))}
              </div>
            ))}
          </div>
          <div className="grid" style={{ height, gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div className="relative">
              {hours.map((h, i) => (
                <div key={h} className="absolute right-2 -translate-y-2 text-[11px] text-ink-soft" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const placed = layout(items.filter((i) => dateToKyiv(i.starts_at).date === d));
              return (
                <div key={d} className={`relative border-l border-line ${d === today ? 'bg-accent-soft/20' : ''}`}>
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
                  ))}
                  {placed.map(({ item, start, end, lane, lanes }) => {
                    const top = ((start - firstHour * 60) / 60) * HOUR_PX;
                    const h = Math.max(((end - start) / 60) * HOUR_PX, 58);
                    const st = STATUS_LABELS[item.status];
                    const recruiter = item.recruiter_id ? nameOf.get(item.recruiter_id) : null;
                    return (
                      <div
                        key={item.id}
                        className={`group absolute overflow-hidden rounded-md border border-line bg-white text-[11px] leading-tight shadow-sm hover:z-10 hover:shadow-md ${item.status === 'done' || item.status === 'no_show' ? 'opacity-60' : ''}`}
                        style={{
                          top: top + 1,
                          height: h - 2,
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                          borderLeft: `4px solid ${KIND_COLORS[item.kind] ?? KIND_COLORS.other}`,
                        }}
                      >
                        {/* Онлайн-зустріч: натискання відкриває Google Meet; картка кандидата — окремою кнопкою */}
                        <a
                          href={item.meet_link ?? (item.candidate_id ? `/candidates/${item.candidate_id}` : '#')}
                          {...(item.meet_link ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          title={item.meet_link ? 'Приєднатися до Google Meet' : `${KIND_LABELS[item.kind] ?? ''} · ${item.candidate_name}`}
                          className="block h-full px-1.5 py-1"
                        >
                          <div className="truncate text-ink-soft">
                            {formatTime(item.starts_at)} · {KIND_LABELS[item.kind] ?? item.kind}
                            {st && item.status !== 'scheduled' ? ` · ${st.label}` : ''}
                          </div>
                          {item.meet_link && (
                            <div className="my-0.5 inline-flex items-center gap-1 rounded bg-[#1A73E8] px-1.5 py-0.5 font-semibold text-white">▶ Google Meet</div>
                          )}
                          <div className="truncate font-semibold" style={{ color: C.candidate }}>
                            {item.candidate_name}
                          </div>
                          <div className="truncate font-medium" style={{ color: C.position }}>
                            {item.vacancy_title}
                          </div>
                          {item.candidate_phone && (
                            <div className="truncate font-medium" style={{ color: C.phone }}>
                              {item.candidate_phone}
                            </div>
                          )}
                          {recruiter && (
                            <div className="truncate font-medium" style={{ color: C.recruiter }}>
                              {recruiter}
                            </div>
                          )}
                        </a>
                        {item.meet_link && item.candidate_id && (
                          <Link
                            href={`/candidates/${item.candidate_id}`}
                            title="Картка кандидата"
                            className="absolute right-1 top-1 rounded border border-line bg-white px-1 text-[10px] text-ink-soft hover:text-ink"
                          >
                            картка
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {items.length === 0 && <p className="mt-3 text-sm text-ink-soft">На цьому тижні подій немає.</p>}
    </>
  );
}
