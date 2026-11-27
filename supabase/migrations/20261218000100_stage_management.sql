-- =====================================================================
-- Етапи воронки: додавання і видалення в налаштуваннях,
-- набір етапів окремо для кожної вакансії.
-- =====================================================================

-- Видалений етап, який уже використовувався в історії, лише архівується
alter table public.pipeline_stages add column archived_at timestamptz;

-- Додати етап після вказаного (за замовчуванням — після останнього робочого етапу)
create or replace function public.add_pipeline_stage(
  p_name text, p_color text, p_sla int, p_contact_kind text, p_after uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_after public.pipeline_stages%rowtype;
  v_pipeline uuid;
  v_order int;
  v_id uuid := gen_random_uuid();
begin
  if not app.has_permission('settings.manage') then
    raise exception 'Немає права змінювати етапи воронки' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'Назва етапу — від 2 до 60 символів' using errcode = 'check_violation';
  end if;
  if p_contact_kind is not null and p_contact_kind not in ('call', 'phone', 'manager', 'repeat', 'polygraph', 'offer', 'start') then
    raise exception 'Невідомий тип контакту' using errcode = 'check_violation';
  end if;
  select id into v_pipeline from public.pipelines where is_default;
  if p_after is not null then
    select * into v_after from public.pipeline_stages where id = p_after and pipeline_id = v_pipeline;
  end if;
  if v_after.id is null then
    select * into v_after from public.pipeline_stages
     where pipeline_id = v_pipeline and kind = 'open' and archived_at is null
     order by sort_order desc limit 1;
  end if;
  v_order := coalesce(v_after.sort_order, 0) + 1;
  update public.pipeline_stages set sort_order = sort_order + 1 where pipeline_id = v_pipeline and sort_order >= v_order;
  insert into public.pipeline_stages (id, pipeline_id, code, name, color, sort_order, kind, sla_days, contact_kind)
  values (v_id, v_pipeline, 'custom_' || substr(replace(v_id::text, '-', ''), 1, 12), trim(p_name),
          coalesce(nullif(p_color, ''), '#9CA3AF'), v_order, 'open', p_sla, p_contact_kind);
  return v_id;
end $$;
revoke execute on function public.add_pipeline_stage(text, text, int, text, uuid) from public, anon;
grant execute on function public.add_pipeline_stage(text, text, int, text, uuid) to authenticated;

-- Видалити етап. Службові (офер, вихід, відмови) і перший етап не видаляються.
-- Якщо етап уже був в історії кандидатів — архівується (зникає з налаштувань і воронок).
create or replace function public.delete_pipeline_stage(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.pipeline_stages%rowtype;
  v_first uuid;
  v_now int;
begin
  if not app.has_permission('settings.manage') then
    raise exception 'Немає права змінювати етапи воронки' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.pipeline_stages where id = p_id and archived_at is null;
  if s.id is null then
    raise exception 'Етап не знайдено' using errcode = 'no_data_found';
  end if;
  select id into v_first from public.pipeline_stages
   where pipeline_id = s.pipeline_id and archived_at is null order by sort_order limit 1;
  if s.kind <> 'open' or s.id = v_first then
    raise exception 'Етап «%» службовий — його можна лише перейменувати', s.name using errcode = 'check_violation';
  end if;
  select count(*) into v_now from public.applications where stage_id = s.id and deleted_at is null;
  if v_now > 0 then
    raise exception 'На етапі «%» зараз кандидатів: % — спершу перенесіть їх на інші етапи', s.name, v_now using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.application_stage_history where from_stage_id = s.id or to_stage_id = s.id)
     or exists (select 1 from public.applications where stage_id = s.id) then
    update public.pipeline_stages set archived_at = now(), is_active = false where id = s.id;
    return 'archived';
  end if;
  delete from public.vacancy_hidden_stages where stage_id = s.id;
  delete from public.stage_transitions where from_stage_id = s.id or to_stage_id = s.id;
  delete from public.pipeline_stages where id = s.id;
  return 'deleted';
end $$;
revoke execute on function public.delete_pipeline_stage(uuid) from public, anon;
grant execute on function public.delete_pipeline_stage(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Етапи, вимкнені для конкретної вакансії (решта етапів воронки показуються)
-- ---------------------------------------------------------------------
create table public.vacancy_hidden_stages (
  vacancy_id  uuid not null references public.vacancies(id) on delete cascade,
  stage_id    uuid not null references public.pipeline_stages(id) on delete cascade,
  primary key (vacancy_id, stage_id)
);
comment on table public.vacancy_hidden_stages is 'Етапи воронки, які не використовуються в цій вакансії.';
alter table public.vacancy_hidden_stages enable row level security;
grant select, insert, delete on public.vacancy_hidden_stages to authenticated;
grant all on public.vacancy_hidden_stages to service_role;

create policy vacancy_hidden_stages_select on public.vacancy_hidden_stages for select to authenticated
  using (exists (select 1 from public.vacancies v where v.id = vacancy_id));
create policy vacancy_hidden_stages_insert on public.vacancy_hidden_stages for insert to authenticated
  with check (exists (select 1 from public.vacancies v where v.id = vacancy_id
                      and app.vacancy_in_scope('vacancies.manage', v.recruiter_id, v.hiring_manager_id)));
create policy vacancy_hidden_stages_delete on public.vacancy_hidden_stages for delete to authenticated
  using (exists (select 1 from public.vacancies v where v.id = vacancy_id
                 and app.vacancy_in_scope('vacancies.manage', v.recruiter_id, v.hiring_manager_id)));

-- Вимикати можна лише робочі етапи, крім першого
create or replace function app.check_hidden_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.pipeline_stages%rowtype; v_first uuid;
begin
  select * into s from public.pipeline_stages where id = new.stage_id;
  select id into v_first from public.pipeline_stages where pipeline_id = s.pipeline_id and archived_at is null order by sort_order limit 1;
  if s.kind <> 'open' or s.id = v_first then
    raise exception 'Етап «%» обов''язковий для кожної вакансії', s.name using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_vacancy_hidden_stages_check before insert on public.vacancy_hidden_stages
  for each row execute function app.check_hidden_stage();
