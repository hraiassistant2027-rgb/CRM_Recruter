import { NextResponse, type NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadVacancyReport, readFilters } from '@/lib/vacancy-report-load';
import { kyivToday, REPORT_HEADER, REPORT_WIDTHS, reportSheetRows } from '@/lib/vacancy-report';
import { buildXlsx } from '@/lib/xlsx';

// Вивантаження звіту по вакансіях у Excel (.xlsx): юрособа — кольорова клітинка. Ті самі фільтри, що й на сторінці.
export async function GET(request: NextRequest) {
  await requirePermission('reports.read');
  const sp: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => (sp[k] = v));
  const { rows } = await loadVacancyReport(await createClient(), readFilters(sp));
  const file = buildXlsx('Звіт по вакансіях', REPORT_HEADER, reportSheetRows(rows), REPORT_WIDTHS);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vacancies-report-${kyivToday()}.xlsx"; filename*=UTF-8''${encodeURIComponent(`Звіт по вакансіях ${kyivToday()}.xlsx`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
