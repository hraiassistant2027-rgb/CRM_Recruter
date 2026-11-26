'use client';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { HrHandoffList, type HandoffRow } from '@/components/hr-handoff';
import { ItCard, ItInfo, type ItRow } from '@/components/it-prep';

function CardTitle({ title, count, subtitle }: { title: string; count: number; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        {title}
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-2 text-sm font-bold text-on-accent tabular-nums">{count}</span>
      </h2>
      <p className="text-xs text-ink-soft">{subtitle}</p>
    </div>
  );
}

// «Кандидати на оформлення» і «Підготовка робочого місця IT» — два блоки однакового розміру.
// Кандидат, обраний ліворуч, відкривається праворуч (заявка IT заповнюється автоматично).
export function OnboardingPanels({
  hrRows,
  itRows,
  contacts,
  itEmails,
  canSend,
  gmailReady,
}: {
  hrRows: HandoffRow[];
  itRows: ItRow[];
  contacts: { id: string; name: string; email: string }[];
  itEmails: string[];
  canSend: boolean;
  gmailReady: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(hrRows[0]?.applicationId ?? null);
  const idx = Math.max(0, itRows.findIndex((r) => r.applicationId === selected));
  const it = itRows[idx];

  return (
    <div className="mt-6 grid items-stretch gap-5 xl:grid-cols-2">
      <Card className="flex flex-col">
        <CardTitle title="Кандидати на оформлення" count={hrRows.length} subtitle="Етап «Офер» · від ранньої дати оформлення до пізньої" />
        {hrRows.length === 0 ? (
          <p className="text-sm text-ink-soft">Кандидатів на етапі «Офер» немає.</p>
        ) : (
          <HrHandoffList rows={hrRows} contacts={contacts} canSend={canSend} gmailReady={gmailReady} selectedId={selected} onSelect={setSelected} />
        )}
      </Card>
      <Card className="flex flex-col">
        <CardTitle title="Підготовка робочого місця IT" count={itRows.length} subtitle="Заявка для системного адміністратора на обраного кандидата" />
        {it ? (
          <>
            <ItInfo itEmails={itEmails} canSend={canSend} gmailReady={gmailReady} />
            <div className="flex-1">
              <ItCard key={it.applicationId} row={it} position={idx + 1} total={itRows.length} canSend={canSend && gmailReady && itEmails.length > 0} />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">Кандидатів на етапі «Офер» немає.</p>
        )}
      </Card>
    </div>
  );
}
