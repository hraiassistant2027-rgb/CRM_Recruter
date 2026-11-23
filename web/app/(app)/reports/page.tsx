import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Звіти та аналітика" };

export default async function Page() {
  await requirePermission("reports.read");
  return (
    <ComingSoon
      title={"Звіти та аналітика"}
      stage={7}
      items={["Конверсія воронки, терміни закриття вакансій", "Фільтри за періодами, вакансіями, об'єктами, рекрутерами", "Конструктор звітів і експорт"]}
    />
  );
}
