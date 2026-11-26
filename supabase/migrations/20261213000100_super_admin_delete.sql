-- =====================================================================
-- Супер адміністратор: видалення користувачів і ролей
-- Користувача видаляємо повністю (обліковий запис, ролі, доступ до просторів, підключення Google).
-- Записи, які він створив (кандидати, вакансії, нотатки, події), залишаються: необов'язкові
-- посилання на нього очищуються, обов'язкові — переходять до Супер адміністратора, який видаляє.
-- Журнал дій не змінюється.
-- =====================================================================
create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = 'super_admin')
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
revoke execute on function app.is_super_admin() from public, anon;
grant execute on function app.is_super_admin() to authenticated;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  r record;
  v_nullable boolean;
begin
  if not app.is_super_admin() then
    raise exception 'Видаляти користувачів може лише Супер адміністратор (вхід з кодом підтвердження)' using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'Себе видалити не можна' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Користувача не знайдено' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id where ur.user_id = p_user and ro.code = 'super_admin')
     and (select count(distinct ur.user_id) from public.user_roles ur join public.roles ro on ro.id = ur.role_id where ro.code = 'super_admin') <= 1 then
    raise exception 'Це єдиний Супер адміністратор — спершу призначте іншого' using errcode = 'check_violation';
  end if;

  -- Усі посилання на користувача (крім тих, що видаляються разом із ним)
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull, c.confdeltype as deltype
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1
  loop
    continue when r.deltype = 'c'; -- on delete cascade
    v_nullable := not r.notnull;
    if v_nullable then
      execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using p_user;
    else
      execute format('update %s set %I = $2 where %I = $1', r.tbl, r.col, r.col) using p_user, v_me;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_me, 'delete', 'user', p_user::text,
          (select jsonb_build_object('full_name', full_name, 'email', email) from public.profiles where id = p_user));

  delete from auth.users where id = p_user;
end $$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Ролі: Супер адміністратор може видалити й системну роль (крім «Супер адміністратор» і «Адміністратор»),
-- якщо вона нікому не призначена
create or replace function app.guard_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'roles' then
    if tg_op = 'DELETE' and old.is_system
       and (old.code in ('super_admin', 'admin') or not app.is_super_admin()) then
      raise exception 'Цю системну роль видалити не можна' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and old.is_system and (new.code <> old.code or new.is_system <> old.is_system) then
      raise exception 'Код системної ролі змінювати не можна' using errcode = 'check_violation';
    end if;
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.roles r where r.code = 'super_admin'
             and (r.id = case when tg_op = 'DELETE' then old.role_id else new.role_id end
                  or (tg_op = 'UPDATE' and r.id = old.role_id)))
     -- права ролі, що видаляється цілком, прибираються разом з нею
     and not (tg_op = 'DELETE' and not exists (select 1 from public.roles where id = old.role_id)) then
    raise exception 'Права ролі SUPER ADMIN змінювати не можна' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
