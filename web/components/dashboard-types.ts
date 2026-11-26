import type { FunnelRow, Slice } from '@/components/dashboard-charts';

export type Overview = {
  funnel: FunnelRow[];
  reasons: { name: string; side: 'company' | 'candidate'; count: number }[];
  sources: Slice[];
  open_vacancies: { id: string; title: string; days: number; color: string }[];
  avg_open_days: number | null;
};
