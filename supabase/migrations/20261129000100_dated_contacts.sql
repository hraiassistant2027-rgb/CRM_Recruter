-- =====================================================================
-- Кожен етап з контактом з кандидатом (від дзвінка до оффера) — з датою і часом
-- =====================================================================
-- Етап воронки може вимагати «контакт» певного типу. Перевести кандидата на такий етап можна
-- лише разом із запланованою подією (дата, час) — вона потрапляє в календар CRM.

alter table public.interviews drop constraint if exists interviews_kind_check;
alter table public.interviews add constraint interviews_kind_check
  check (kind in ('call', 'phone', 'manager', 'repeat', 'offer', 'other'));
comment on column public.interviews.kind is
  'call — дзвінок, phone — телефонна співбесіда, manager — з керівником, repeat — повторна, offer — обговорення оффера.';

alter table public.pipeline_stages add column if not exists contact_kind text
  check (contact_kind is null or contact_kind in ('call', 'phone', 'manager', 'repeat', 'offer'));
comment on column public.pipeline_stages.contact_kind is 'Етап вимагає запланованого контакту цього типу (дата і час обов''язкові).';

update public.pipeline_stages s set contact_kind = v.kind
from public.pipelines p, (values
  ('first_contact', 'call'), ('phone_interview', 'phone'), ('manager_interview', 'manager'),
  ('repeat_interview', 'repeat'), ('offer', 'offer')) as v(code, kind)
where s.pipeline_id = p.id and p.is_default and s.code = v.code;

-- Правила етапів + обов'язкова дата контакту
create or replace function app.applications_check_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage      public.pipeline_stages%rowtype;
  v_pipeline   uuid;
  v_has_rules  boolean;
  v_rule       public.stage_transitions%rowtype;
  v_field      text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select * into v_stage from public.pipeline_stages where id = new.stage_id;
  select pipeline_id into v_pipeline from public.vacancies where id = new.vacancy_id;

  if v_stage.pipeline_id is distinct from v_pipeline then
    raise exception 'Етап не належить воронці цієї вакансії' using errcode = 'check_violation';
  end if;
  if not v_stage.is_active then
    raise exception 'Етап «%» вимкнено', v_stage.name using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    select exists (select 1 from public.stage_transitions where from_stage_id = old.stage_id)
      into v_has_rules;
    if v_has_rules then
      select * into v_rule from public.stage_transitions
       where from_stage_id = old.stage_id and to_stage_id = new.stage_id;
      if not found then
        raise exception 'Перехід на етап «%» з поточного етапу заборонено налаштуваннями воронки', v_stage.name
          using errcode = 'check_violation';
      end if;
      foreach v_field in array v_rule.required_fields loop
        if coalesce(to_jsonb(new) ->> v_field, '') = '' then
          raise exception 'Для переходу на етап «%» заповніть поле %', v_stage.name, v_field
            using errcode = 'check_violation';
        end if;
      end loop;
    end if;
  end if;

  -- Етап з контактом: має бути запланована подія цього типу, створена після входу на попередній етап
  if v_stage.contact_kind is not null and not exists (
       select 1 from public.interviews i
       where i.application_id = new.id
         and i.kind = v_stage.contact_kind
         and i.status <> 'cancelled'
         and (tg_op = 'INSERT' or i.created_at >= old.stage_changed_at)) then
    raise exception 'Для етапу «%» вкажіть дату і час контакту з кандидатом', v_stage.name using errcode = 'check_violation';
  end if;

  if v_stage.kind in ('rejected', 'withdrawn') and new.rejection_reason_id is null then
    raise exception 'Для етапу «%» вкажіть причину відмови', v_stage.name using errcode = 'check_violation';
  end if;

  new.stage_changed_at := now();
  if v_stage.kind = 'hired' then
    new.hired_at := coalesce(new.hired_at, now());
  end if;
  if v_stage.kind in ('hired', 'rejected', 'withdrawn') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

-- Переміщення по етапах з датою контакту (створює подію в календарі CRM)
drop function if exists public.move_application(uuid, uuid, uuid, text);
create or replace function public.move_application(
  p_id uuid, p_stage_id uuid, p_reason_id uuid default null, p_comment text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null, p_location text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_kind     text;
  v_contact  text;
  v_name     text;
  v_rows     int;
  v_event    uuid;
begin
  select kind, contact_kind, name into v_kind, v_contact, v_name from public.pipeline_stages where id = p_stage_id;
  if v_kind is null then
    raise exception 'Етап не знайдено' using errcode = 'invalid_parameter_value';
  end if;

  if v_contact is not null then
    if p_starts_at is null then
      raise exception 'Для етапу «%» вкажіть дату і час контакту з кандидатом', v_name using errcode = 'check_violation';
    end if;
    insert into public.interviews (application_id, kind, starts_at, ends_at, location, status)
    values (p_id, v_contact, p_starts_at, coalesce(p_ends_at, p_starts_at + interval '30 minutes'),
            nullif(trim(p_location), ''), 'scheduled')
    returning id into v_event;
  end if;

  perform set_config('app.stage_comment', coalesce(trim(p_comment), ''), true);
  update public.applications
     set stage_id            = p_stage_id,
         rejection_reason_id = case when v_kind in ('rejected', 'withdrawn') then p_reason_id end,
         rejection_comment   = case when v_kind in ('rejected', 'withdrawn') then nullif(trim(p_comment), '') end,
         last_contact_at     = now(),
         next_action_at      = coalesce(p_starts_at, next_action_at)
   where id = p_id and deleted_at is null;
  get diagnostics v_rows = row_count;
  perform set_config('app.stage_comment', '', true);
  if v_rows = 0 then
    raise exception 'Немає права змінювати цей відгук' using errcode = 'insufficient_privilege';
  end if;
  return v_event;
end $$;
revoke execute on function public.move_application(uuid, uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.move_application(uuid, uuid, uuid, text, timestamptz, timestamptz, text) to authenticated, service_role;
