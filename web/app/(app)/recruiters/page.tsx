import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Рекрутери" };

export default async function Page() {
  await requirePermission("analytics.read");
  return (
    <ComingSoon
      title={"Рекрутери"}
      stage={7}
      items={["Навантаження і результати кожного рекрутера", "Порівняння за періодами"]}
    />
  );
}
