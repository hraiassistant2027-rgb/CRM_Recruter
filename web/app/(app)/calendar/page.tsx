import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { loadAgenda } from '@/lib/interviews-load';
import { KIND_LABELS, STATUS_LABELS } from '@/lib/interviews';
import { addDays, dateToKyiv, formatTime, kyivToDate, todayKyiv, weekStart } from '@/lib/time';

export const metadata: Metadata = { title: 'Календар' };

const DAY = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

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
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const href = (w: string, a = all) => `/calendar?week=${w}${a ? '&all=1' : ''}`;

  return (
    <>
      <PageHeader title="Календар співбесід" description="Події створюються у Google Календарі організатора; тут — зведення по CRM" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Link href={href(addDays(week, -7))} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface">
              ← Попередній
            </Link>
            <span className="font-medium">
              {DAY.format(new Date(`${week}T00:00:00Z`)).replace(/^\S+,\s*/, '')} — {DAY.format(new Date(`${addDays(week, 6)}T00:00:00Z`)).replace(/^\S+,\s*/, '')}
            </span>
            <Link href={href(addDays(week, 7))} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface">
              Наступний →
            </Link>
            {week !== weekStart(today) && (
              <Link href={href(weekStart(today))} className="underline">
                Цей тиждень
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
      </Card>

      <div className="space-y-4">
        {days.map((d) => {
          const list = items.filter((i) => dateToKyiv(i.starts_at).date === d);
          return (
            <section key={d}>
              <h2 className={`mb-2 text-sm font-medium ${d === today ? 'text-ink' : 'text-ink-soft'}`}>
                {DAY.format(new Date(`${d}T00:00:00Z`))}
                {d === today && <Badge tone="warn">сьогодні</Badge>}
              </h2>
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-2 text-xs text-ink-soft">Співбесід немає</p>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                  {list.map((i) => {
                    const st = STATUS_LABELS[i.status] ?? { label: i.status, tone: 'neutral' as const };
                    return (
                      <li key={i.id} className="flex flex-wrap items-start gap-4 px-4 py-3 text-sm">
                        <span className="w-24 shrink-0 font-medium">
                          {formatTime(i.starts_at)}–{formatTime(i.ends_at)}
                        </span>
                        <span className="min-w-0 flex-1">
                          {i.candidate_id ? (
                            <Link href={`/candidates/${i.candidate_id}`} className="font-medium hover:underline">
                              {i.candidate_name}
                            </Link>
                          ) : (
                            <span className="font-medium">{i.candidate_name}</span>
                          )}
                          <span className="block text-xs text-ink-soft">
                            {KIND_LABELS[i.kind] ?? i.kind} · {i.vacancy_title}
                            {i.organizer_id ? ` · ${nameOf.get(i.organizer_id) ?? ''}` : ''}
                          </span>
                          {(i.location || i.meet_link) && (
                            <span className="block text-xs">
                              {i.location}
                              {i.meet_link && (
                                <>
                                  {i.location ? ' · ' : ''}
                                  <a href={i.meet_link} target="_blank" rel="noopener noreferrer" className="underline">
                                    Google Meet
                                  </a>
                                </>
                              )}
                            </span>
                          )}
                        </span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
