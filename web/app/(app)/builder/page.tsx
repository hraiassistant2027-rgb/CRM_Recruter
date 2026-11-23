import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Конструктор CRM" };

export default async function Page() {
  await requirePermission("builder.edit");
  return (
    <ComingSoon
      title={"Конструктор CRM"}
      stage={8}
      items={["Створення нових модулів (адаптація, кадровий резерв, навчання…)", "Редагування меню, сторінок, полів, карток і статусів", "Чернетка → перевірка → публікація → відкат"]}
    />
  );
}
