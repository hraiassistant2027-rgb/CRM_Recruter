import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isWorkspaceCode, WORKSPACE_COOKIE } from '@/lib/workspace';
import { appUrl } from '@/lib/env';

// Перемикання простору (клік на логотип). Перехід дозволено лише в простір, до якого є доступ.
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get('to');
  const nextRaw = request.nextUrl.searchParams.get('next') ?? '/';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';
  // Адреса сайту — з налаштувань (за проксі Render request.nextUrl містить внутрішній localhost)
  if (!isWorkspaceCode(to)) return NextResponse.redirect(new URL('/', appUrl()));
  // Попереднє завантаження посилань (prefetch) не повинно перемикати простір — лише явний клік
  const h = request.headers;
  if (h.get('next-router-prefetch') || /prefetch/i.test(h.get('purpose') ?? h.get('sec-purpose') ?? '')) {
    return new NextResponse(null, { status: 204 });
  }
  const supabase = await createClient({ workspace: to });
  const { data } = await supabase.rpc('my_workspaces');
  const allowed = ((data ?? []) as { code: string }[]).some((w) => w.code === to);
  const target = new URL(allowed ? next : '/', appUrl());
  const res = NextResponse.redirect(target);
  if (allowed) {
    res.cookies.set(WORKSPACE_COOKIE, to, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
