import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/env';

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase.rpc('log_event', { p_action: 'logout', p_entity: 'auth', p_entity_id: null, p_details: null });
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login?info=signed_out', appUrl()), { status: 303 });
}
