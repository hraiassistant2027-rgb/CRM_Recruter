'use client';
import { useState, useTransition } from 'react';
import { disconnectGoogle } from '@/app/(app)/inbox/actions';
import { Alert, Button } from '@/components/ui';

export function DisconnectGoogleButton() {
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          if (!confirm('Відключити Google? CRM більше не зможе надсилати листи і створювати події у вашому календарі.')) return;
          start(async () => setMessage(await disconnectGoogle()));
        }}
      >
        {busy ? '…' : 'Відключити'}
      </Button>
      {message?.error && <Alert>{message.error}</Alert>}
      {message?.ok && <Alert kind="success">{message.ok}</Alert>}
    </div>
  );
}
