// Довідники співбесід

export const KIND_LABELS: Record<string, string> = {
  call: 'Дзвінок кандидату',
  phone: 'Телефонна співбесіда',
  manager: 'Співбесіда з керівником',
  repeat: 'Повторна співбесіда',
  offer: 'Оффер: зустріч або дзвінок',
  other: 'Співбесіда',
};

// Колір смуги події в календарі за типом контакту
export const KIND_COLORS: Record<string, string> = {
  call: '#38BDF8',
  phone: '#818CF8',
  manager: '#F59E0B',
  repeat: '#FBBF24',
  offer: '#16A34A',
  other: '#9CA3AF',
};

// Типи контакту, для яких за замовчуванням варто надіслати кандидату запрошення з календаря
export const INVITE_BY_DEFAULT = ['manager', 'repeat', 'offer'];

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
