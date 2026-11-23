import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Вакансії" };

export default async function Page() {
  await requirePermission("vacancies.read");
  return (
    <ComingSoon
      title={"Вакансії"}
      stage={4}
      items={["Вакансії з об'єктом, керівником, зарплатою і пріоритетом", "Кандидати, пов'язані з кожною вакансією"]}
    />
  );
}
