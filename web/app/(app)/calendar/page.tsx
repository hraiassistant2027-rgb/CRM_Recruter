import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { ComingSoon } from '@/components/ui';

export const metadata: Metadata = { title: "Календар" };

export default async function Page() {
  await requirePermission("interviews.manage");
  return (
    <ComingSoon
      title={"Календар"}
      stage={6}
      items={["Співбесіди з Google Calendar", "Учасники, перенесення, скасування, нагадування"]}
    />
  );
}
