'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { prepareEmail, sendEmail } from '@/app/(app)/inbox/actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { findPlaceholders, textToHtml } from '@/lib/email';

type Option = { id: string; name: string };

export function EmailComposer({
  candidateId,
  candidateEmail,
  fromEmail,
  templates,
  applications,
  interviewId,
  defaultTemplateId,
  defaultApplicationId,
}: {
  candidateId: string;
  candidateEmail: string;
  fromEmail: string;
  templates: Option[];
  applications: Option[];
  interviewId?: string;
  defaultTemplateId?: string;
  defaultApplicationId?: string;
}) {
  const [applicationId, setApplicationId] = useState(defaultApplicationId ?? applications[0]?.id ?? '');
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  function load(nextTemplate: string, nextApplication: string) {
    setMessage(null);
    startLoading(async () => {
      const r = await prepareEmail({ candidateId, applicationId: nextApplication || null, templateId: nextTemplate || null, interviewId: interviewId ?? null });
      if (r.error) setMessage({ error: r.error });
      else {
        setSubject(r.subject ?? '');
        setBody(r.body ?? '');
      }
    });
  }

  const loaded = useRef(false);
  useEffect(() => {
    if (defaultTemplateId && !loaded.current) {
      loaded.current = true;
      load(defaultTemplateId, defaultApplicationId ?? applications[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeholders = findPlaceholders(`${subject}\n${body}`);

  if (message?.ok) {
    return (
      <div className="space-y-3">
        <Alert kind="success">{message.ok}</Alert>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setMessage(null);
            setSubject('');
            setBody('');
            setTemplateId('');
            setStep('edit');
          }}
        >
          Написати ще один лист
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-soft">
        Від: <strong>{fromEmail}</strong> → Кому: <strong>{candidateEmail}</strong>
      </p>
      {step === 'edit' ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {applications.length > 0 && (
              <Field label="Вакансія (для підстановки назви)" htmlFor="mail-app">
                <Select
                  id="mail-app"
                  value={applicationId}
                  onChange={(e) => {
                    setApplicationId(e.target.value);
                    if (templateId) load(templateId, e.target.value);
                  }}
                >
                  <option value="">— без вакансії —</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Шаблон" htmlFor="mail-template">
              <Select
                id="mail-template"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  load(e.target.value, applicationId);
                }}
              >
                <option value="">— власний текст —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Тема" htmlFor="mail-subject">
            <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={loading} />
          </Field>
          <Field label="Текст листа" htmlFor="mail-body" hint="Порожній рядок — новий абзац">
            <textarea
              id="mail-body"
              rows={10}
              value={body}
              disabled={loading}
              onChange={(e) => setBody(e.target.value)}
              className="block w-full rounded-xl border border-field-line bg-field px-3.5 py-2.5 text-sm focus:border-accent-strong focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent/15"
            />
          </Field>
          {placeholders.length > 0 && (
            <Alert kind="info">Замініть у тексті: {placeholders.map((p) => `[${p}]`).join(', ')}</Alert>
          )}
          {message?.error && <Alert>{message.error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={loading || !subject.trim() || !body.trim()} onClick={() => setStep('preview')}>
              Переглянути перед надсиланням
            </Button>
            {templateId === '' && !body && (
              <Button type="button" variant="secondary" disabled={loading} onClick={() => load('', applicationId)}>
                Вставити привітання і підпис
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-line">
            <div className="border-b border-line bg-surface px-4 py-2 text-sm">
              <span className="text-ink-soft">Тема: </span>
              <strong>{subject}</strong>
            </div>
            <div className="prose-sm px-4 py-3 text-sm [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: textToHtml(body) }} />
          </div>
          {placeholders.length > 0 && <Alert>Лист містить незаповнені місця: {placeholders.map((p) => `[${p}]`).join(', ')}. Поверніться і виправте.</Alert>}
          {message?.error && <Alert>{message.error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={sending || placeholders.length > 0}
              onClick={() =>
                startSending(async () => {
                  const r = await sendEmail({ candidateId, applicationId: applicationId || null, templateId: templateId || null, subject, body });
                  setMessage(r);
                })
              }
            >
              {sending ? 'Надсилаємо…' : 'Надіслати'}
            </Button>
            <Button type="button" variant="secondary" disabled={sending} onClick={() => setStep('edit')}>
              ← Редагувати
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
