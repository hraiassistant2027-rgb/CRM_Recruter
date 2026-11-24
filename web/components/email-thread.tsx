'use client';
import { useState, useTransition } from 'react';
import { syncCandidateEmails, syncRecentEmails } from '@/app/(app)/inbox/actions';
import { Alert, Button } from '@/components/ui';

export function SyncEmailsButton({ candidateId }: { candidateId?: string }) {
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => start(async () => setMessage(candidateId ? await syncCandidateEmails(candidateId) : await syncRecentEmails()))}
      >
        {busy ? 'Перевіряємо пошту…' : 'Оновити з Gmail'}
      </Button>
      {message?.error && <Alert>{message.error}</Alert>}
      {message?.ok && <Alert kind="success">{message.ok}</Alert>}
    </div>
  );
}
