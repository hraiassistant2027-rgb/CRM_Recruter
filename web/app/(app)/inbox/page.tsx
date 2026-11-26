import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MailOpen } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Badge, Card, PageHeader } from '@/components/ui';
import { SyncEmailsButton } from '@/components/email-thread';
import { formatDate } from '@/lib/candidates';

export const metadata: Metadata = { title: 'Комунікації' };

type Msg = {
  id: string;
  candidate_id: string;
  direction: 'in' | 'out';
  subject: string | null;
  snippet: string | null;
  status: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission('email.read');
  const sp = await searchParams;
  const only = (Array.isArray(sp.only) ? sp.only[0] : sp.only) === 'in' ? 'in' : 'all';
  const supabase = await createClient();
  let q = supabase
    .from('email_messages')
    .select('id, candidate_id, direction, subject, snippet, status, sent_at, received_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (only === 'in') q = q.eq('direction', 'in');
  const [{ data }, { data: account }] = await Promise.all([
    q,
    supabase.from('email_accounts').select('google_email, status, last_sync_at').eq('user_id', session.userId).maybeSingle(),
  ]);
  const messages = (data ?? []) as Msg[];
  const ids = [...new Set(messages.map((m) => m.candidate_id))];
  const { data: candidates } = ids.length ? await supabase.from('candidates').select('id, full_name').in('id', ids) : { data: [] };
  const nameOf = new Map(((candidates ?? []) as { id: string; full_name: string }[]).map((c) => [c.id, c.full_name]));
  const ready = account?.status === 'active';

  return (
    <>
      <PageHeader title="Комунікації" description="Листування з кандидатами: надіслані листи і відповіді" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="text-sm">
            {ready ? (
              <>
                Ваша скринька: <strong>{account!.google_email}</strong>
                {account!.last_sync_at && <span className="text-ink-soft"> · перевірено {formatDate(account!.last_sync_at, true)}</span>}
              </>
            ) : (
              <>
                Gmail не підключено —{' '}
                <Link href="/profile" className="underline">
                  підключити в профілі
                </Link>
              </>
            )}
            <div className="mt-2 flex gap-3">
              <Link href="/inbox" className={only === 'all' ? 'font-medium underline' : 'text-ink-soft underline'}>
                Усі
              </Link>
              <Link href="/inbox?only=in" className={only === 'in' ? 'font-medium underline' : 'text-ink-soft underline'}>
                Лише відповіді кандидатів
              </Link>
            </div>
          </div>
          {ready && <SyncEmailsButton />}
        </div>
      </Card>

      {messages.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">Листів ще немає. Надішліть лист кандидату з його картки або натисніть «Оновити з Gmail».</p>
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-white shadow-card">
          {messages.map((m) => (
            <li key={m.id} className={`px-4 py-3 text-sm ${m.direction === 'in' ? 'bg-accent-soft/20' : ''}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                {m.direction === 'in' ? <MailOpen className="h-3.5 w-3.5" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}
                <Link href={`/candidates/${m.candidate_id}`} className="font-medium text-ink hover:underline">
                  {nameOf.get(m.candidate_id) ?? 'Кандидат'}
                </Link>
                <span>{m.direction === 'in' ? 'відповів(-ла)' : 'лист кандидату'}</span>
                <span>· {formatDate(m.sent_at ?? m.received_at ?? m.created_at, true)}</span>
                {m.status === 'failed' && <Badge tone="danger">не надіслано</Badge>}
              </div>
              <div className="mt-1 font-medium">{m.subject || '(без теми)'}</div>
              <div className="truncate text-xs text-ink-soft">{m.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
