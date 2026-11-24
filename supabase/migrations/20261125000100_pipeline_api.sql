-- =====================================================================
-- Етап 4. Вакансії та воронка: лічильники, переміщення між етапами
-- =====================================================================

-- Коментар до переходу (наприклад, «не вийшов на зв'язок») передається через налаштування сесії
-- і потрапляє в історію етапів разом із переходом
create or replace function app.applications_log_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.application_stage_history (application_id, from_stage_id, to_stage_id, changed_by, comment)
    values (new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid(),
            nullif(left(current_setting('app.stage_comment', true), 1000), ''));
  end if;
  return null;
end $$;

-- Кількість відгуків по вакансіях і етапах (з урахуванням прав користувача)
create or replace function public.vacancy_stage_counts()
returns table (vacancy_id uuid, stage_id uuid, cnt bigint)
language sql stable security invoker set search_path = '' as $$
  select a.vacancy_id, a.stage_id, count(*)
  from public.applications a
  where a.deleted_at is null
  group by a.vacancy_id, a.stage_id
$$;
revoke execute on function public.vacancy_stage_counts() from public, anon;
grant execute on function public.vacancy_stage_counts() to authenticated;

-- Переміщення кандидата на інший етап. Права і правила етапів перевіряє база (RLS + тригер).
create or replace function public.move_application(
  p_id uuid, p_stage_id uuid, p_reason_id uuid default null, p_comment text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_kind text;
  v_rows int;
begin
  select kind into v_kind from public.pipeline_stages where id = p_stage_id;
  if v_kind is null then
    raise exception 'Етап не знайдено' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('app.stage_comment', coalesce(trim(p_comment), ''), true);

  update public.applications
     set stage_id            = p_stage_id,
         rejection_reason_id = case when v_kind in ('rejected', 'withdrawn') then p_reason_id end,
         rejection_comment   = case when v_kind in ('rejected', 'withdrawn') then nullif(trim(p_comment), '') end,
         last_contact_at     = now()
   where id = p_id and deleted_at is null;
  get diagnostics v_rows = row_count;
  perform set_config('app.stage_comment', '', true);
  if v_rows = 0 then
    raise exception 'Немає права змінювати цей відгук' using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke execute on function public.move_application(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.move_application(uuid, uuid, uuid, text) to authenticated;
