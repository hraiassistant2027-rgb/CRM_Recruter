import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Download } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, Select } from '@/components/ui';
import { EntityColorPicker } from '@/components/entity-color-picker';
import { formatDate } from '@/lib/candidates';
import { CLASS_INFO } from '@/lib/vacancies';
import { loadVacancyReport, readFilters } from '@/lib/vacancy-report-load';
import { plural, summarize, type ReportRow } from '@/lib/vacancy-report';

export const metadata: Metadata = { title: 'Звіти та аналітика' };

const CLASS_TONE: Record<string, string> = {
  A: 'bg-ok-soft text-ok',
  B: 'bg-accent-soft text-[#8a6500]',
  C: 'bg-[#ffedd5] text-[#c2410c]',
  D: 'bg-danger-soft text-danger',
};

function ClassBadge({ cls }: { cls: string | null }) {
  if (!cls) return <span className="text-ink-soft">—</span>;
  return (
    <span title={CLASS_INFO[cls]?.label} className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${CLASS_TONE[cls] ?? ''}`}>
      {cls}
    </span>
  );
}

function Remaining({ row }: { row: ReportRow }) {
  if (row.closed) {
    return (
      <span className="text-xs text-ok">
        Закрито{row.closeDays != null ? ` за ${row.closeDays} ${plural(row.closeDays, 'день', 'дні', 'днів')}` : ''}
      </span>
    );
  }
  if (row.status === 'cancelled') return <span className="text-xs text-ink-soft">Скасовано</span>;
  if (row.daysLeft == null || row.plannedDays == null) return <span className="text-xs text-ink-soft">Немає плану</span>;
  const used = Math.min(100, Math.round((row.daysInWork / row.plannedDays) * 100));
  const overdue = row.daysLeft < 0;
  const bar = overdue ? 'bg-danger' : used >= 75 ? 'bg-accent-strong' : 'bg-ok';
  return (
    <div className="w-36" title={row.deadline ? `Плановий строк: ${formatDate(row.deadline)}` : undefined}>
      <div className={`mb-1 text-xs font-medium ${overdue ? 'text-danger' : 'text-ink'}`}>
        {overdue
          ? `Прострочено ${-row.daysLeft} ${plural(-row.daysLeft, 'день', 'дні', 'днів')}`
          : `Залишилось ${row.daysLeft} ${plural(row.daysLeft, 'день', 'дні', 'днів')}`}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${overdue ? 100 : used}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? ''}`}>{value}</div>
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('reports.read');
  const sp = await searchParams;
  const f = readFilters(sp);
  const supabase = await createClient();
  const { rows, entities, projects, users } = await loadVacancyReport(supabase, f);
  const s = summarize(rows);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '') as [string, string][]).toString();
  const usedEntities = entities.filter((e) => e.is_active || e.id === f.entity);

  return (
    <>
      <PageHeader
        title="Звіт по вакансіях"
        description="Збирається автоматично з вакансій, воронки кандидатів і календаря"
        actions={
          <a href={`/api/reports/vacancies${qs ? `?${qs}` : ''}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-surface">
            <Download className="h-4 w-4" aria-hidden /> Вивантажити в Excel
          </a>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Вакансій у звіті" value={rows.length} />
        <Stat label="Посад (к-ть)" value={s.positions} />
        <Stat label="В роботі" value={s.open} />
        <Stat label="Закрито" value={s.closed} tone="text-ok" />
        <Stat label="Прострочено" value={s.overdue} tone={s.overdue ? 'text-danger' : undefined} />
        <Stat label="Середній строк закриття" value={s.avgCloseDays != null ? `${s.avgCloseDays} дн.` : '—'} />
      </div>

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Статус</span>
            <Select name="status" defaultValue={f.status}>
              <option value="all">Усі</option>
              <option value="active">В роботі</option>
              <option value="closed">Закриті</option>
            </Select>
          </label>
          <div className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Юр. особа</span>
            <EntityColorPicker name="entity" entities={usedEntities} defaultValue={f.entity} emptyLabel="Усі" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Проект</span>
            <Select name="project" defaultValue={f.project}>
              <option value="">Усі</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Рекрутер</span>
            <Select name="recruiter" defaultValue={f.recruiter}>
              <option value="">Усі</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Клас</span>
            <Select name="cls" defaultValue={f.cls}>
              <option value="">Усі</option>
              {Object.entries(CLASS_INFO).map(([k, info]) => (
                <option key={k} value={k}>{k} — {info.label}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">Відкрито з</span>
            <input type="date" name="from" defaultValue={f.from} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">по</span>
            <input type="date" name="to" defaultValue={f.to} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-strong">Показати</button>
          {qs && <Link href="/reports" className="pb-2 text-sm text-ink-soft underline">Скинути</Link>}
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Вакансій за цими умовами немає.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[1400px] text-sm">
            <thead className="border-b border-line bg-surface text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-3 font-medium">Вакансія</th>
                <th className="px-2 py-3 text-center font-medium">К-ть</th>
                <th className="px-3 py-3 font-medium">Місце</th>
                <th className="px-3 py-3 font-medium">Нова / заміна</th>
                <th className="px-3 py-3 font-medium">Проект</th>
                <th className="px-2 py-3 text-center font-medium">Клас</th>
                <th className="px-3 py-3 font-medium">Відкрито</th>
                <th className="px-3 py-3 font-medium">Коригування</th>
                <th className="px-2 py-3 text-center font-medium">План, дн</th>
                <th className="px-2 py-3 text-center font-medium">В роботі, дн</th>
                <th className="px-3 py-3 font-medium">Строк</th>
                <th className="px-3 py-3 font-medium">Кандидат</th>
                <th className="px-3 py-3 font-medium">Оформлення</th>
                <th className="px-3 py-3 font-medium">Рекрутер</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={`align-top hover:bg-surface/60 ${r.closed ? 'bg-ok-soft/30' : ''}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-0.5 h-4 w-4 shrink-0 rounded"
                        style={{ background: r.legalEntity?.color ?? 'var(--color-line)' }}
                        aria-hidden
                      />
                      <Link href={`/vacancies/${r.id}`} className="min-w-0 font-medium hover:underline">{r.title}</Link>
                      {r.closed && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Закрита" />}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {r.hiredCount > 0 && r.headcount > 1 ? `${r.hiredCount}/${r.headcount}` : r.headcount}
                  </td>
                  <td className="px-3 py-3">{r.workPlace ?? '—'}</td>
                  <td className="px-3 py-3">{r.requestType ?? '—'}</td>
                  <td className="px-3 py-3">{r.project ?? '—'}</td>
                  <td className="px-2 py-3 text-center"><ClassBadge cls={r.difficultyClass} /></td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{formatDate(r.openedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{r.adjustedAt ? formatDate(r.adjustedAt) : '—'}</td>
                  <td className="px-2 py-3 text-center">{r.plannedDays ?? '—'}</td>
                  <td className="px-2 py-3 text-center font-medium">{r.daysInWork}</td>
                  <td className="px-3 py-3"><Remaining row={r} /></td>
                  <td className="max-w-56 px-3 py-3">
                    <span className={r.hiredCount ? 'font-medium' : 'text-ink-soft'}>{r.candidates}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{r.startDate ? formatDate(r.startDate) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{r.recruiter ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <Card>
          <h2 className="mb-3 font-medium">Класи вакансій</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(CLASS_INFO).map(([k, info]) => (
              <div key={k} className="flex gap-3 rounded-lg border border-line p-3">
                <ClassBadge cls={k} />
                <div className="text-sm">
                  <div className="font-medium">{info.label} · {info.days} днів</div>
                  <div className="text-xs text-ink-soft">{info.traits}</div>
                  <div className="text-xs text-ink-soft">Тактика: {info.tactic}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
