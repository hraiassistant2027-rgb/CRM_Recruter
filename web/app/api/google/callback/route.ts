import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { GOOGLE_SCOPES, emailFromIdToken, encryptToken, exchangeCode, revokeToken } from '@/lib/google';

function back(request: NextRequest, result: string) {
  const res = NextResponse.redirect(new URL(`/profile?google=${result}`, request.url));
  res.cookies.delete({ name: 'g_oauth_state', path: '/api/google/callback' });
  return res;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL('/login', request.url));

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return back(request, 'denied');
  const state = params.get('state') ?? '';
  const expected = request.cookies.get('g_oauth_state')?.value ?? '';
  const same = state.length > 0 && state.length === expected.length && timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  const code = params.get('code');
  if (!same || !code) return back(request, 'state');

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    console.error('[google-callback]', e instanceof Error ? e.message : e);
    return back(request, 'error');
  }
  const granted = (tokens.scope ?? '').split(' ');
  const missing = GOOGLE_SCOPES.filter((s) => s.startsWith('https://') && !granted.includes(s));
  const email = emailFromIdToken(tokens.id_token);
  if (!tokens.refresh_token || !email) {
    if (tokens.access_token) await revokeToken(tokens.access_token);
    return back(request, 'no_refresh');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('email_accounts').upsert(
    {
      user_id: data.user.id,
      google_email: email,
      refresh_token_encrypted: encryptToken(tokens.refresh_token),
      token_key_id: 'v1',
      scopes: granted,
      status: 'active',
      last_error: null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[google-callback] save', error.message);
    return back(request, 'error');
  }
  return back(request, missing.length ? 'partial' : 'connected');
}
