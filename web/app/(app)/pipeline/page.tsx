import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Воронка рекрутингу" };

export default async function Page() {
  await requirePermission("applications.read");
  return (
    <ComingSoon
      title={"Воронка рекрутингу"}
      stage={4}
      items={["Kanban-дошка з 13 етапами", "Перетягування кандидатів між етапами з перевіркою правил", "Причини відмов і наступні дії"]}
    />
  );
}
