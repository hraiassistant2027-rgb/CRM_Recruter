import { NextResponse, type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { readAnalyticsFilters, rpcArgs, type Analytics } from '@/lib/analytics';
import { buildXlsx } from '@/lib/xlsx';

// Вивантаження таблиць аналітики в Excel: ?kind=recruiters | sources, фільтри як на сторінці
export async function GET(request: NextRequest) {
  await requirePermission('reports.read');
  const sp: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => (sp[k] = v));
  const f = readAnalyticsFilters(sp);
  const { data, error } = await (await createClient()).rpc('analytics_report', rpcArgs(f));
  if (error || !data) return new NextResponse('Не вдалося побудувати звіт', { status: 400 });
  const a = data as Analytics;
  const period = `${f.from}_${f.to}`;

  let file: Buffer;
  let title: string;
  if (sp.kind === 'sources') {
    title = 'Джерела';
    file = buildXlsx(
      title,
      ['', 'Джерело', 'Нових кандидатів', 'Відгуків у вакансіях', 'До керівника', 'Офер', 'Найнято'],
      a.sources.map((s) => [{ fill: s.color }, s.name, s.candidates, s.applications, s.manager, s.offers, s.hires]),
      [3, 24, 16, 18, 14, 10, 10],
    );
  } else {
    title = 'Рекрутери';
    file = buildXlsx(
      title,
      ['Рекрутер', 'Додав кандидатів', 'Співбесід', 'Найнято', 'Закрито вакансій', 'Сер. строк закриття, дн', 'Зараз у роботі', 'Прострочено'],
      a.recruiters.map((r) => [r.name, r.candidates, r.interviews, r.hires, r.closed, r.avg_close_days, r.open_now, r.overdue]),
      [26, 16, 11, 10, 16, 20, 14, 12],
    );
  }
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analytics-${sp.kind === 'sources' ? 'sources' : 'recruiters'}-${period}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Аналітика — ${title} ${period}.xlsx`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
