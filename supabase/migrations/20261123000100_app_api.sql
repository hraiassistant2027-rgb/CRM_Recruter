-- =====================================================================
-- 0012. Функції для інтерфейсу: мої дозволи, перевірка права, список користувачів
-- =====================================================================

-- Дозволи поточного користувача (для побудови меню і кнопок в інтерфейсі).
-- Інтерфейс лише ховає недоступне; справжній контроль — RLS у базі.
create or replace function public.my_permissions()
returns table (permission_code text, scope text)
language sql stable security definer set search_path = '' as $$
  select rp.permission_code,
         case when bool_or(rp.scope = 'all') then 'all' else 'own' end
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid() and p.is_active
  group by rp.permission_code
$$;

-- Перевірка одного права з боку сервера застосунку (наприклад, перед запрошенням користувача)
create or replace function public.check_permission(p_code text, p_require_mfa boolean default false)
returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_permission(p_code) and (not p_require_mfa or app.is_aal2())
$$;

-- Список користувачів для адмін-панелі (лише з правом users.manage)
create or replace function public.admin_list_users()
returns table (
  id uuid, full_name text, email text, phone text, is_active boolean, mfa_required boolean,
  created_at timestamptz, last_sign_in_at timestamptz, has_mfa boolean, role_codes text[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.has_permission('users.manage') then
    raise exception 'Немає права керувати користувачами' using errcode = 'insufficient_privilege';
  end if;
  return query
  select p.id, p.full_name, p.email, p.phone, p.is_active, p.mfa_required, p.created_at,
         u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
         coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}')
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.user_roles ur on ur.user_id = p.id
  left join public.roles r on r.id = ur.role_id
  group by p.id, u.last_sign_in_at
  order by p.is_active desc, p.full_name;
end $$;

revoke execute on function public.my_permissions() from public, anon;
revoke execute on function public.check_permission(text, boolean) from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.check_permission(text, boolean) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
