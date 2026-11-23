import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, secretKey } from '@/lib/env';

// Адмін-клієнт обходить RLS. Використовувати ЛИШЕ після перевірки прав
// поточного користувача через public.check_permission(..., true).
export function createAdminClient() {
  const { url } = publicEnv();
  return createClient(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
