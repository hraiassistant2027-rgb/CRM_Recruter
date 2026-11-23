import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Комунікації" };

export default async function Page() {
  await requirePermission("email.read");
  return (
    <ComingSoon
      title={"Комунікації"}
      stage={5}
      items={["Підключення Gmail рекрутера", "Листи за шаблонами з попереднім переглядом", "Історія листування в картці кандидата"]}
    />
  );
}
