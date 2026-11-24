// Довідники співбесід

export const KIND_LABELS: Record<string, string> = {
  phone: 'Телефонна співбесіда',
  manager: 'Співбесіда з керівником',
  repeat: 'Повторна співбесіда',
  other: 'Співбесіда',
};

export const STATUS_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  scheduled: { label: 'призначено', tone: 'ok' },
  rescheduled: { label: 'перенесено', tone: 'warn' },
  cancelled: { label: 'скасовано', tone: 'neutral' },
  done: { label: 'відбулась', tone: 'ok' },
  no_show: { label: 'не з’явився', tone: 'danger' },
};

export const RESPONSE_LABELS: Record<string, string> = {
  needsAction: 'ще не відповів',
  accepted: 'прийняв',
  declined: 'відхилив',
  tentative: 'можливо',
};

export type InterviewRow = {
  id: string;
  application_id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  meet_link: string | null;
  status: string;
  result: string | null;
  result_comment: string | null;
  organizer_id: string | null;
};

export const INTERVIEW_COLUMNS = 'id, application_id, kind, starts_at, ends_at, location, meet_link, status, result, result_comment, organizer_id';
