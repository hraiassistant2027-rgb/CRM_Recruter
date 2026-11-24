import { appUrl } from '@/lib/env';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { authorizationUrl, googleConfigured } from '@/lib/google';

// Початок підключення Google: захисний код (state) у cookie, перехід на сторінку згоди Google
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL('/login', appUrl()));
  if (!googleConfigured()) return NextResponse.redirect(new URL('/profile?google=not_configured', appUrl()));

  const state = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(authorizationUrl(state, data.user.email ?? undefined));
  response.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/google/callback',
    maxAge: 600,
  });
  return response;
}
