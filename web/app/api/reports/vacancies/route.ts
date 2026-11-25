import { NextResponse, type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadVacancyReport, readFilters } from '@/lib/vacancy-report-load';
import { kyivToday, reportCsv } from '@/lib/vacancy-report';

// Вивантаження звіту по вакансіях у CSV (Excel відкриває одразу). Ті самі фільтри, що й на сторінці.
export async function GET(request: NextRequest) {
  await requirePermission('reports.read');
  const sp: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => (sp[k] = v));
  const { rows } = await loadVacancyReport(await createClient(), readFilters(sp));
  return new NextResponse(reportCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vacancies-report-${kyivToday()}.csv"; filename*=UTF-8''${encodeURIComponent(`Звіт по вакансіях ${kyivToday()}.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
