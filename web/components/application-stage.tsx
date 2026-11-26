'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { moveApplication, type ContactInput } from '@/app/(app)/vacancies/actions';
import { ContactDialog, RejectDialog, type Reason } from '@/components/pipeline-board';
import { EmailComposer } from '@/components/email-composer';
import { Alert, Button } from '@/components/ui';
import type { Site } from '@/components/location-picker';
import type { Stage } from '@/lib/vacancies';

const CLOSED = ['rejected', 'withdrawn'];

// Зміна етапу прямо з картки кандидата — з тими ж правилами, що й у воронці
export function ApplicationStage({
  applicationId,
  candidateName,
  currentStageId,
  stages,
  reasons,
  sites,
  defaultSiteId,
  googleReady,
  mail,
}: {
  applicationId: string;
  candidateName: string;
  currentStageId: string;
  stages: Stage[];
  reasons: Reason[];
  sites: Site[];
  defaultSiteId: string | null;
  googleReady: boolean;
  mail: { candidateId: string; candidateEmail: string; fromEmail: string; templates: { id: string; name: string }[]; inviteTemplateId?: string } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<{ stage: Stage; mode: 'reject' | 'contact' } | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, start] = useTransition();
  const card = { full_name: candidateName };

  function move(stage: Stage, reasonId: string | null, comment: string | null, contact: ContactInput | null) {
    start(async () => {
      const r = await moveApplication({ applicationId, stageId: stage.id, reasonId, comment, contact });
      setMsg(r);
      if (r.ok) {
        setFollowUp(r.interviewId && contact?.meet ? r.interviewId : null);
        setWriting(false);
        router.refresh();
      }
    });
  }

  function choose(id: string) {
    const stage = stages.find((s) => s.id === id);
    if (!stage || stage.id === currentStageId) return;
    setMsg(null);
    if (CLOSED.includes(stage.kind)) setPending({ stage, mode: 'reject' });
    else if (stage.contact_kind) setPending({ stage, mode: 'contact' });
    else move(stage, null, null, null);
  }

  return (
    <div className="mt-2 space-y-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-ink-soft">Перевести на етап:</span>
        <select
          value={currentStageId}
          disabled={busy}
          onChange={(e) => choose(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-field-line bg-field px-2 py-1 text-xs focus:bg-white"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.contact_kind ? ' — з датою' : ''}
            </option>
          ))}
        </select>
      </label>
      {busy && <p className="text-xs text-ink-soft">Зберігаємо…</p>}
      {msg?.error && <Alert>{msg.error}</Alert>}
      {msg?.ok && !followUp && msg.ok !== 'Етап змінено.' && <Alert kind="success">{msg.ok}</Alert>}

      {followUp && mail && (
        <div className="space-y-2 rounded-lg border border-accent/50 bg-accent-soft/40 p-3">
          <p className="text-sm">Зустріч онлайн: посилання Google Meet створено. Надіслати кандидату лист із датою, часом і посиланням?</p>
          {!writing ? (
            <div className="flex gap-2">
              <Button type="button" onClick={() => setWriting(true)}>
                Так, написати лист
              </Button>
              <Button type="button" variant="secondary" onClick={() => setFollowUp(null)}>
                Ні, достатньо запрошення з календаря
              </Button>
            </div>
          ) : (
            <EmailComposer
              candidateId={mail.candidateId}
              candidateEmail={mail.candidateEmail}
              fromEmail={mail.fromEmail}
              templates={mail.templates}
              applications={[{ id: applicationId, name: 'ця вакансія' }]}
              interviewId={followUp}
              defaultTemplateId={mail.inviteTemplateId}
              defaultApplicationId={applicationId}
            />
          )}
        </div>
      )}

      {pending?.mode === 'contact' && (
        <ContactDialog
          pending={{ card, stage: pending.stage }}
          googleReady={googleReady}
          sites={sites}
          defaultSiteId={defaultSiteId}
          onCancel={() => setPending(null)}
          onConfirm={(contact, comment) => {
            const p = pending;
            setPending(null);
            move(p.stage, null, comment, contact);
          }}
        />
      )}
      {pending?.mode === 'reject' && (
        <RejectDialog
          pending={{ card, stage: pending.stage }}
          reasons={reasons.filter((r) => r.side === (pending.stage.kind === 'withdrawn' ? 'candidate' : 'company'))}
          onCancel={() => setPending(null)}
          onConfirm={(reasonId, comment) => {
            const p = pending;
            setPending(null);
            move(p.stage, reasonId, comment, null);
          }}
        />
      )}
    </div>
  );
}
