'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

// Браузерний клієнт використовується лише для MFA (налаштування і перевірка коду).
export function createClient() {
  const { url, key } = publicEnv();
  return createBrowserClient(url, key);
}
