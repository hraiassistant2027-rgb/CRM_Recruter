// Листи і запрошення з календаря кандидатам. На час тестування CRM вимкнено:
// увімкнути — змінна середовища NEXT_PUBLIC_CANDIDATE_MAIL_ENABLED=true (у Render) і новий деплой.
export const CANDIDATE_MAIL_BLOCKED = process.env.NEXT_PUBLIC_CANDIDATE_MAIL_ENABLED !== 'true';
export const CANDIDATE_MAIL_BLOCKED_MSG = 'Листи й запрошення кандидатам тимчасово вимкнено на час тестування CRM';
