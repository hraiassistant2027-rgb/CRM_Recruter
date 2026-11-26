import 'server-only';
import type { createClient } from '@/lib/supabase/server';

// Ліміт файлів у тарифі Supabase. Безкоштовний — 1 ГБ; після переходу на Pro задайте STORAGE_LIMIT_MB=102400
export function storageLimitBytes(): number {
  const mb = Number(process.env.STORAGE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 1024) * 1024 * 1024;
}

export async function loadStorageUsage(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.rpc('storage_usage');
  if (error || !data) return null;
  const bytes = Number((data as { bytes: number }).bytes) || 0;
  const files = Number((data as { files: number }).files) || 0;
  const limit = storageLimitBytes();
  return { bytes, files, limit, ratio: bytes / limit };
}

export function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} ГБ`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} МБ`;
  return `${Math.max(1, Math.round(b / 1024))} КБ`;
}
