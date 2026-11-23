import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/env';
import { safeNext } from '@/lib/validation';

const ALLOWED_TYPES: EmailOtpType[] = ['invite', 'recovery', 'email', 'magiclink', 'signup', 'email_change'];

// Обробка посилань із листів (запрошення, відновлення пароля)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get('token_hash');
  const type = sp.get('type') as EmailOtpType | null;
  const code = sp.get('code');
  const next = safeNext(sp.get('next'), type === 'invite' || type === 'recovery' ? '/update-password' : '/');

  const supabase = await createClient();

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, appUrl()));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, appUrl()));
  }

  return NextResponse.redirect(new URL('/login?error=link', appUrl()));
}
