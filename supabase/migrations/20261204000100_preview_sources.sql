-- =====================================================================
-- Попередній перегляд оригіналу резюме (PDF-копія Word-документів) і статистика за джерелами
-- =====================================================================
alter table public.documents add column if not exists preview_path text;
comment on column public.documents.preview_path is 'PDF-копія документа для перегляду в браузері (Word/RTF, конвертовано через Google Диск).';

alter table public.sources add column if not exists color text not null default '#9CA3AF'
  check (color ~ '^#[0-9A-Fa-f]{6}$');
update public.sources s set color = v.color
from (values
  ('Work.ua', '#2563EB'), ('robota.ua', '#DC2626'), ('Рекомендація', '#16A34A'), ('LinkedIn', '#6366F1'),
  ('Telegram', '#06B6D4'), ('Сайт компанії', '#F59E0B'), ('Архів резюме', '#8B5CF6'), ('Інше', '#9CA3AF')) as v(name, color)
where s.name = v.name;

-- Кількість кандидатів у базі за джерелами (з урахуванням прав користувача)
create or replace function public.candidate_source_counts()
returns table (source_id uuid, cnt bigint)
language sql stable security invoker set search_path = '' as $$
  select c.source_id, count(*)
  from public.candidates c
  where c.deleted_at is null and c.merged_into_id is null
  group by c.source_id
$$;
revoke execute on function public.candidate_source_counts() from public, anon;
grant execute on function public.candidate_source_counts() to authenticated, service_role;
