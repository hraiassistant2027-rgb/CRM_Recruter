import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "База кандидатів" };

export default async function Page() {
  await requirePermission("candidates.read");
  return (
    <ComingSoon
      title={"База кандидатів"}
      stage={3}
      items={["Картки кандидатів: контакти, досвід, освіта, навички", "Масове завантаження резюме (PDF, DOC, DOCX, ZIP) і розпізнавання через AI", "Пошук дублікатів і об'єднання", "Пошук за текстом резюме", "Імпорт архіву (~50 ГБ)"]}
    />
  );
}
