'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importResume, type ImportResult } from '@/app/(app)/candidates/actions';
import { Alert, Button, Field, Select } from '@/components/ui';

type Row = { name: string; state: 'waiting' | 'working' | 'done'; result?: ImportResult };

const MAX_FILES = 50;

const STATUS_TEXT: Record<ImportResult['status'], { label: string; cls: string }> = {
  created: { label: 'Створено', cls: 'text-ok' },
  existing: { label: 'Вже в базі', cls: 'text-ink' },
  duplicate_file: { label: 'Дублікат файлу', cls: 'text-ink-soft' },
  error: { label: 'Помилка', cls: 'text-danger' },
};

export function BulkResumeUpload({ vacancyId, sources }: { vacancyId?: string; sources: { id: string; name: string }[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    if (!files.length) return;
    setRunning(true);
    setNote(null);
    const list: Row[] = files.map((f) => ({ name: f.name, state: 'waiting' }));
    setRows(list);
    for (let i = 0; i < files.length; i++) {
      setRows((r) => r.map((row, j) => (j === i ? { ...row, state: 'working' } : row)));
      const data = new FormData();
      data.set('resume', files[i]);
      if (vacancyId) data.set('vacancy_id', vacancyId);
      if (sourceId) data.set('source_id', sourceId);
      let result: ImportResult;
      try {
        result = await importResume(data);
      } catch {
        result = { status: 'error', message: 'Збій з’єднання або файл завеликий' };
      }
      setRows((r) => r.map((row, j) => (j === i ? { ...row, state: 'done', result } : row)));
    }
    setRunning(false);
    setFiles([]);
    router.refresh();
  }

  const done = rows.filter((r) => r.state === 'done');
  const count = (s: ImportResult['status']) => done.filter((r) => r.result?.status === s).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Field label="Файли резюме" htmlFor="bulk-files" hint={`До ${MAX_FILES} файлів за раз, кожен до 20 МБ. PDF, DOCX, RTF, TXT, DOC, JPG, PNG`}>
          <input
            id="bulk-files"
            type="file"
            multiple
            disabled={running}
            accept=".pdf,.doc,.docx,.rtf,.txt,.jpg,.jpeg,.png"
            onChange={(e) => {
              const chosen = Array.from(e.currentTarget.files ?? []);
              setNote(chosen.length > MAX_FILES ? `Обрано ${chosen.length} файлів — буде завантажено перші ${MAX_FILES}` : null);
              setFiles(chosen.slice(0, MAX_FILES));
              setRows([]);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm"
          />
        </Field>
        <Field label="Джерело для всіх (необов'язково)" htmlFor="bulk-source">
          <Select id="bulk-source" value={sourceId} disabled={running} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">— не вказано —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {note && <Alert kind="info">{note}</Alert>}
      <p className="text-xs text-ink-soft">
        Для кожного файлу система розпізнає ПІБ і контакти. Якщо кандидат уже є в базі (збіг телефону, email або LinkedIn), резюме буде додано до його картки, а не створено дубль.
        Нові картки позначаються «не перевірено» — перегляньте їх пізніше (фільтр «Не перевірені» в базі).
      </p>
      <Button type="button" disabled={running || files.length === 0} onClick={run}>
        {running ? `Обробляємо ${done.length + 1} з ${rows.length}…` : `Завантажити ${files.length || ''} ${vacancyId ? 'і додати у вакансію' : 'в базу'}`.replace('  ', ' ')}
      </Button>

      {rows.length > 0 && (
        <div className="space-y-2">
          {!running && done.length > 0 && (
            <Alert kind="success">
              Готово: створено {count('created')}, уже були в базі {count('existing') + count('duplicate_file')}, помилок {count('error')}.
            </Alert>
          )}
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink-soft" title={r.name}>
                    {r.name}
                  </span>
                  {r.result?.candidateId ? (
                    <Link href={`/candidates/${r.result.candidateId}`} target="_blank" className="font-medium hover:underline">
                      {r.result.name ?? 'картка'}
                    </Link>
                  ) : null}
                  {r.result && <span className="block text-xs text-ink-soft">{r.result.message}</span>}
                </span>
                <span className={`shrink-0 text-xs font-medium ${r.result ? STATUS_TEXT[r.result.status].cls : 'text-ink-soft'}`}>
                  {r.state === 'waiting' ? 'в черзі' : r.state === 'working' ? 'обробляється…' : STATUS_TEXT[r.result!.status].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
