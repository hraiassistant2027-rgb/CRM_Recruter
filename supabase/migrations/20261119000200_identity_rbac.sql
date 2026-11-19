-- =====================================================================
-- 0002. Користувачі, ролі, дозволи, доступ до полів
-- =====================================================================

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  phone         text,
  is_active     boolean not null default true,
  mfa_required  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Користувачі CRM (1:1 з auth.users). Вхід лише за запрошенням.';

create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  name         text not null,
  description  text,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.permissions (
  code         text primary key,
  module       text not null,
  name         text not null,
  description  text
);
comment on table public.permissions is 'Каталог дозволів. Дозволи модулів конструктора мають вигляд entity:<код>.<дія>.';

create table public.role_permissions (
  role_id          uuid not null references public.roles(id) on delete cascade,
  permission_code  text not null references public.permissions(code) on delete cascade on update cascade,
  scope            text not null default 'all' check (scope in ('all', 'own')),
  primary key (role_id, permission_code)
);
comment on column public.role_permissions.scope is 'all = усі записи; own = лише свої (відповідальний, власник або керівник вакансії).';

create table public.user_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete restrict,
  granted_by  uuid references public.profiles(id),
  granted_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.field_permissions (
  id           uuid primary key default gen_random_uuid(),
  role_id      uuid not null references public.roles(id) on delete cascade,
  entity_code  text not null,
  field_code   text not null,
  access       text not null check (access in ('hidden', 'read', 'write')),
  unique (role_id, entity_code, field_code)
);
comment on table public.field_permissions is 'Обмеження доступу до окремих полів; застосовується серверним шаром API.';

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function app.set_updated_at();
create trigger trg_roles_updated before update on public.roles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- Функції перевірки прав (security definer, щоб не впиратися в RLS ролей)
-- ---------------------------------------------------------------------

create or replace function app.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  )
$$;

-- Повертає 'all', 'own' або null (немає дозволу)
create or replace function app.permission_scope(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select case
           when bool_or(rp.scope = 'all') then 'all'
           when count(*) > 0 then 'own'
         end
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where ur.user_id = auth.uid()
    and p.is_active
    and rp.permission_code = p_code
$$;

create or replace function app.has_permission(p_code text)
returns boolean language sql stable as $$
  select app.permission_scope(p_code) is not null
$$;

create or replace function app.has_permission_all(p_code text)
returns boolean language sql stable as $$
  select app.permission_scope(p_code) = 'all'
$$;

-- Сесія підтверджена другим фактором (MFA)
create or replace function app.is_aal2()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Адміністративна дія: потрібен дозвіл + MFA в поточній сесії
create or replace function app.has_admin_permission(p_code text)
returns boolean language sql stable as $$
  select app.has_permission(p_code) and app.is_aal2()
$$;

-- ---------------------------------------------------------------------
-- Профіль створюється автоматично, коли адміністратор запрошує користувача
-- ---------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();
