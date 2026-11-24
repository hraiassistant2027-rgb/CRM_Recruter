'use client';
import { useState, useTransition } from 'react';
import { saveBankFolder } from '../../resume-bank/actions';
import { Alert, Button, Field, Input } from '@/components/ui';

export function BankFolderForm({ current }: { current: string }) {
  const [link, setLink] = useState(current);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setMsg(await saveBankFolder(link)));
      }}
    >
      <Field label="Посилання на папку архіву в Google Диску" htmlFor="bank-link">
        <Input id="bank-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Читаємо структуру папок… (до кількох хвилин)' : 'Зберегти'}
      </Button>
      {msg?.error && <Alert>{msg.error}</Alert>}
      {msg?.ok && <Alert kind="success">{msg.ok}</Alert>}
    </form>
  );
}
