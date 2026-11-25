-- =====================================================================
-- Етап 8: конструктор CRM — власні поля карток кандидата і вакансії, конструктор ролей
-- Метадані полів змінюються лише через функції нижче (прямий запис у fields закрито з етапу 1).
-- Поле не видаляється, а архівується — значення в картках зберігаються і повертаються разом із полем.
-- =====================================================================
alter table public.fields
  add column if not exists help_text text check (help_text is null or length(help_text) <= 300),
  add column if not exists show_in_list boolean not null default false;

-- Типи полів, доступні в конструкторі зараз
create or replace function app.builder_field_types() returns text[] language sql immutable as $$
  select array['text', 'long_text', 'number', 'money', 'date', 'boolean', 'select', 'multiselect', 'email', 'phone', 'url']
$$;

create or replace function app.builder_options(p_type text, p_options jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
  if p_type not in ('select', 'multiselect') then
    return '[]'::jsonb;
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'Додайте варіанти для списку' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(distinct_v order by ord), '[]') into v
  from (select distinct on (lower(trim(x))) trim(x) as distinct_v, ord
        from jsonb_array_elements_text(p_options) with ordinality as e(x, ord)
        where length(trim(x)) between 1 and 100
        order by lower(trim(x)), ord) t;
  if jsonb_array_length(v) = 0 then
    raise exception 'Додайте хоча б один варіант для списку' using errcode = '22023';
  end if;
  if jsonb_array_length(v) > 100 then
    raise exception 'Не більше 100 варіантів у списку' using errcode = '22023';
  end if;
  return v;
end $$;

-- Створити або змінити поле. Тип поля після створення не змінюється (лише текст ↔ довгий текст),
-- щоб уже заповнені значення не стали некоректними.
create or replace function public.builder_save_field(
  p_id uuid,
  p_entity text,
  p_name text,
  p_type text,
  p_required boolean default false,
  p_options jsonb default '[]',
  p_help text default null,
  p_show_in_list boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entity public.entities%rowtype;
  v_field public.fields%rowtype;
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not app.has_permission('builder.edit') then
    raise exception 'Немає права працювати в конструкторі' using errcode = 'insufficient_privilege';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Назва поля — від 2 до 80 символів' using errcode = '22023';
  end if;
  if p_help is not null and length(p_help) > 300 then
    raise exception 'Підказка — до 300 символів' using errcode = '22023';
  end if;

  if p_id is null then
    select * into v_entity from public.entities where code = p_entity and code in ('candidates', 'vacancies');
    if not found then
      raise exception 'Поля можна додавати лише в картку кандидата або вакансії' using errcode = '22023';
    end if;
    if not (p_type = any (app.builder_field_types())) then
      raise exception 'Невідомий тип поля' using errcode = '22023';
    end if;
    if exists (select 1 from public.fields where entity_id = v_entity.id and lower(name) = lower(v_name) and archived_at is null) then
      raise exception 'Поле з такою назвою вже є' using errcode = '23505';
    end if;
    if (select count(*) from public.fields where entity_id = v_entity.id) >= 100 then
      raise exception 'Не більше 100 полів у картці' using errcode = '22023';
    end if;
    v_id := gen_random_uuid();
    insert into public.fields (id, entity_id, code, name, type, is_required, options, help_text, show_in_list, sort_order)
    values (v_id, v_entity.id, 'f_' || substr(replace(v_id::text, '-', ''), 1, 10), v_name, p_type, coalesce(p_required, false),
            app.builder_options(p_type, p_options), nullif(trim(p_help), ''), coalesce(p_show_in_list, false),
            coalesce((select max(sort_order) from public.fields where entity_id = v_entity.id), 0) + 1);
    return v_id;
  end if;

  select * into v_field from public.fields where id = p_id;
  if not found or v_field.is_system then
    raise exception 'Поле не знайдено' using errcode = 'P0002';
  end if;
  if p_type is not null and p_type <> v_field.type
     and not (p_type in ('text', 'long_text') and v_field.type in ('text', 'long_text')) then
    raise exception 'Тип поля змінити не можна — створіть нове поле' using errcode = '22023';
  end if;
  if exists (select 1 from public.fields where entity_id = v_field.entity_id and id <> p_id and lower(name) = lower(v_name) and archived_at is null) then
    raise exception 'Поле з такою назвою вже є' using errcode = '23505';
  end if;
  update public.fields
     set name = v_name,
         type = coalesce(p_type, type),
         is_required = coalesce(p_required, false),
         options = app.builder_options(coalesce(p_type, type), p_options),
         help_text = nullif(trim(p_help), ''),
         show_in_list = coalesce(p_show_in_list, false)
   where id = p_id;
  return p_id;
end $$;

create or replace function public.builder_move_field(p_id uuid, p_up boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.fields%rowtype; n public.fields%rowtype;
begin
  if not app.has_permission('builder.edit') then
    raise exception 'Немає права працювати в конструкторі' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.fields where id = p_id and not is_system;
  if not found then raise exception 'Поле не знайдено' using errcode = 'P0002'; end if;
  if p_up then
    select * into n from public.fields where entity_id = v.entity_id and not is_system and archived_at is null
      and (sort_order, id::text) < (v.sort_order, v.id::text) order by sort_order desc, id::text desc limit 1;
  else
    select * into n from public.fields where entity_id = v.entity_id and not is_system and archived_at is null
      and (sort_order, id::text) > (v.sort_order, v.id::text) order by sort_order, id::text limit 1;
  end if;
  if not found then return; end if;
  if n.sort_order = v.sort_order then
    update public.fields set sort_order = sort_order + 1 where id = case when p_up then v.id else n.id end;
  else
    update public.fields set sort_order = n.sort_order where id = v.id;
    update public.fields set sort_order = v.sort_order where id = n.id;
  end if;
end $$;

create or replace function public.builder_archive_field(p_id uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.fields%rowtype;
begin
  if not app.has_permission('builder.edit') then
    raise exception 'Немає права працювати в конструкторі' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.fields where id = p_id and not is_system;
  if not found then raise exception 'Поле не знайдено' using errcode = 'P0002'; end if;
  if not p_archived and exists (select 1 from public.fields where entity_id = v.entity_id and id <> p_id
                                and lower(name) = lower(v.name) and archived_at is null) then
    raise exception 'Уже є активне поле з такою назвою — перейменуйте одне з них' using errcode = '23505';
  end if;
  update public.fields set archived_at = case when p_archived then now() end where id = p_id;
end $$;

revoke execute on function public.builder_save_field(uuid, text, text, text, boolean, jsonb, text, boolean) from public, anon;
revoke execute on function public.builder_move_field(uuid, boolean) from public, anon;
revoke execute on function public.builder_archive_field(uuid, boolean) from public, anon;
grant execute on function public.builder_save_field(uuid, text, text, text, boolean, jsonb, text, boolean) to authenticated;
grant execute on function public.builder_move_field(uuid, boolean) to authenticated;
grant execute on function public.builder_archive_field(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Конструктор ролей: захист системних ролей
-- ---------------------------------------------------------------------
create or replace function app.guard_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'roles' then
    if tg_op = 'DELETE' and old.is_system then
      raise exception 'Системну роль видалити не можна' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and old.is_system and (new.code <> old.code or new.is_system <> old.is_system) then
      raise exception 'Код системної ролі змінювати не можна' using errcode = 'check_violation';
    end if;
    return coalesce(new, old);
  end if;
  -- role_permissions: права SUPER ADMIN не змінюються (щоб не втратити доступ до системи)
  if exists (select 1 from public.roles r where r.code = 'super_admin'
             and (r.id = case when tg_op = 'DELETE' then old.role_id else new.role_id end
                  or (tg_op = 'UPDATE' and r.id = old.role_id))) then
    raise exception 'Права ролі SUPER ADMIN змінювати не можна' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
grant delete on public.roles to authenticated;
create trigger trg_roles_guard before update or delete on public.roles
  for each row execute function app.guard_roles();
create trigger trg_role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function app.guard_roles();

