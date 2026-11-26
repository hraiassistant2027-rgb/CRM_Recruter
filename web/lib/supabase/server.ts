import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import { isWorkspaceCode, WORKSPACE_COOKIE } from '@/lib/workspace';

// Клієнт від імені поточного користувача: усі запити проходять через RLS бази.
// Простір (KAN Talent / HomeHub) передається заголовком x-workspace; база сама перевіряє доступ.
// opts.workspace — інший простір або кілька через кому (пошук в обох базах).
export async function createClient(opts: { workspace?: string } = {}) {
  const cookieStore = await cookies();
  const { url, key } = publicEnv();
  const fromCookie = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const workspace = opts.workspace ?? (isWorkspaceCode(fromCookie) ? fromCookie : 'kan');
  return createServerClient(url, key, {
    global: { headers: { 'x-workspace': workspace } },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Виклик із Server Component: сесію оновить middleware.
        }
      },
    },
  });
}
