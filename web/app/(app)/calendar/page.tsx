import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader } from '@/components/ui';
import { loadAgenda, type AgendaItem } from '@/lib/interviews-load';
import { KIND_COLORS, KIND_LABELS, STATUS_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatTime, kyivToDate, todayKyiv, weekStart } from '@/lib/time';
import { DayListButton, type DayList } from '@/components/day-list';
import { CalendarEvent } from '@/components/calendar-event';

export const metadata: Metadata = { title: 'Календар' };

// Кольори полів у події — однакові всюди, щоб око швидко знаходило потрібне
const C = {
  candidate: '#1A1A7A', // кандидат — темно-синій
  position: '#B45309', // посада — бурштиновий
  phone: '#15803D', // телефон — зелений
  recruiter: '#BE185D', // рекрутер — малиновий
};

const SLOT_MIN = 30; // крок сітки — пів години
const SLOT_PX = 44; // висота одного пів-годинного рядка
const DAY_START = 9 * 60 + 30; // 9:30
const DAY_END = 18 * 60; // останній слот 17:30–18:00
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
  // Сітка 9:30–18:00 по пів години; ширша, якщо є зустрічі раніше чи пізніше
  const gridStart = Math.min(DAY_START, ...starts.map((m) => Math.floor(m / SLOT_MIN) * SLOT_MIN));
  const gridEnd = Math.max(DAY_END, ...ends.map((m) => Math.ceil(m / SLOT_MIN) * SLOT_MIN));
  const slots = Array.from({ length: (gridEnd - gridStart) / SLOT_MIN }, (_, i) => gridStart + i * SLOT_MIN);
  const height = slots.length * SLOT_PX;
  const label = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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

      <div className="overflow-x-auto rounded-3xl bg-white shadow-card">
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
              {slots.map((m, i) => (
                <div
                  key={m}
                  className={`absolute right-2 text-[11px] ${m % 60 === 0 ? 'font-medium text-ink' : 'text-ink-soft'}`}
                  style={{ top: i * SLOT_PX + 2 }}
                >
                  {label(m)}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const placed = layout(items.filter((i) => dateToKyiv(i.starts_at).date === d));
              return (
                <div key={d} className={`relative border-l border-line ${d === today ? 'bg-accent-soft/20' : ''}`}>
                  {slots.map((m, i) => (
                    <div key={m} className={`absolute inset-x-0 border-t ${m % 60 === 0 ? 'border-line' : 'border-dashed border-line/60'}`} style={{ top: i * SLOT_PX }} />
                  ))}
                  {placed.map(({ item, start, end, lane, lanes }) => {
                    const top = ((start - gridStart) / SLOT_MIN) * SLOT_PX;
                    const h = Math.max(((end - start) / SLOT_MIN) * SLOT_PX, 40);
                    const st = STATUS_LABELS[item.status];
                    const recruiter = item.recruiter_id ? nameOf.get(item.recruiter_id) : null;
                    return (
                      <CalendarEvent
                        key={item.id}
                        box={{
                          top: top + 1,
                          height: h - 2,
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                        }}
                        e={{
                          id: item.id,
                          time: formatTime(item.starts_at),
                          kindLabel: KIND_LABELS[item.kind] ?? item.kind,
                          kindColor: KIND_COLORS[item.kind] ?? KIND_COLORS.other,
                          statusLabel: st && item.status !== 'scheduled' ? st.label : null,
                          faded: item.status === 'done' || item.status === 'no_show',
                          candidateId: item.candidate_id,
                          candidateName: item.candidate_name,
                          position: item.vacancy_title,
                          phone: item.candidate_phone,
                          recruiter: recruiter ?? null,
                          meetLink: item.meet_link,
                        }}
                      />
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
