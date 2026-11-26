-- =====================================================================
-- Простори: KAN Talent і HomeHub (управляюча компанія) — окремі бази кандидатів, вакансій,
-- воронок, звітів і довідників в одній CRM.
--
-- Який простір показувати, сервер передає заголовком запиту x-workspace (код або id; кілька —
-- через кому, напр. «kan,homehub» для пошуку в обох базах). База сама перевіряє, що користувач
-- має доступ: Супер адміністратор і Адміністратор — до всіх просторів, інші — лише до своїх
-- (таблиця workspace_members). Без заголовка — усі доступні користувачу простори.
-- Спільні для обох просторів: користувачі і ролі, етапи воронки, джерела, причини відмов,
-- власні поля конструктора.
-- =====================================================================
create table public.workspaces (
  id          uuid primary key,
  code        text not null unique check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name        text not null,
  theme       text not null,
  sort_order  int not null default 0
);
comment on table public.workspaces is 'Простори CRM (окремі бази для різних компаній групи).';
insert into public.workspaces (id, code, name, theme, sort_order) values
  ('a1000000-0000-0000-0000-000000000001', 'kan', 'KAN Talent', 'kan', 1),
  ('a1000000-0000-0000-0000-000000000002', 'homehub', 'HomeHub', 'homehub', 2);

create table public.workspace_members (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, workspace_id)
);
comment on table public.workspace_members is 'До якого простору має доступ користувач (адміністраторам — до всіх автоматично).';

-- Наявні користувачі — у KAN Talent
insert into public.workspace_members (user_id, workspace_id)
select id, 'a1000000-0000-0000-0000-000000000001' from public.profiles on conflict do nothing;

-- Новий користувач за замовчуванням — у KAN Talent (запрошення з HomeHub змінює це одразу після створення)
create or replace function app.default_workspace_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members (user_id, workspace_id)
  values (new.id, 'a1000000-0000-0000-0000-000000000001') on conflict do nothing;
  return new;
end $$;
create trigger trg_profiles_workspace after insert on public.profiles
  for each row execute function app.default_workspace_member();

-- ---------------------------------------------------------------------
-- Доступ до просторів
-- ---------------------------------------------------------------------
create or replace function app.is_workspace_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code in ('super_admin', 'admin'))
$$;

create or replace function app.member_of(p_ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_ws is not null and app.is_active_user() and (
    app.is_workspace_admin()
    or exists (select 1 from public.workspace_members m where m.user_id = auth.uid() and m.workspace_id = p_ws))
$$;

-- Простори із заголовка x-workspace (null — заголовка немає)
create or replace function app.header_workspaces() returns uuid[]
language plpgsql stable set search_path = '' as $$
declare
  v_raw text;
  v_ids uuid[];
begin
  begin
    v_raw := nullif(trim(current_setting('request.headers', true)::json ->> 'x-workspace'), '');
  exception when others then
    v_raw := null;
  end;
  if v_raw is null then
    return null;
  end if;
  select coalesce(array_agg(w.id order by w.sort_order), '{}') into v_ids
  from public.workspaces w
  where w.code = any (string_to_array(lower(replace(v_raw, ' ', '')), ','))
     or w.id::text = any (string_to_array(lower(replace(v_raw, ' ', '')), ','));
  return v_ids;
end $$;

-- Простори, дані яких бачить цей запит
create or replace function app.visible_workspaces() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(w.id order by w.sort_order), '{}')
  from public.workspaces w
  where (app.header_workspaces() is null or w.id = any (app.header_workspaces()))
    and app.member_of(w.id)
$$;

-- Простір, у який записуються нові картки, вакансії, довідники.
-- Службові записи без користувача (міграції, сервісний ключ) — у KAN Talent.
create or replace function app.current_workspace() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((app.visible_workspaces())[1],
                  case when auth.uid() is null then 'a1000000-0000-0000-0000-000000000001'::uuid end)
$$;

revoke execute on function app.is_workspace_admin(), app.member_of(uuid), app.header_workspaces(),
  app.visible_workspaces(), app.current_workspace() from public, anon;
grant execute on function app.is_workspace_admin(), app.member_of(uuid), app.header_workspaces(),
  app.visible_workspaces(), app.current_workspace() to authenticated, service_role;

-- Для інтерфейсу: доступні простори і поточний
create or replace function public.my_workspaces() returns table (id uuid, code text, name text, theme text, is_current boolean)
language sql stable security definer set search_path = '' as $$
  select w.id, w.code, w.name, w.theme, w.id = app.current_workspace()
  from public.workspaces w
  where app.member_of(w.id)
  order by w.sort_order
$$;
revoke execute on function public.my_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated;

-- ---------------------------------------------------------------------
-- Колонка простору в даних
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['candidates', 'vacancies', 'applications', 'interviews', 'documents',
                           'legal_entities', 'projects', 'sites', 'departments', 'hr_contacts',
                           'email_templates', 'app_settings'] loop
    execute format('alter table public.%I add column workspace_id uuid references public.workspaces(id)', t);
    execute format('update public.%I set workspace_id = %L', t, 'a1000000-0000-0000-0000-000000000001');
    execute format('alter table public.%I alter column workspace_id set default app.current_workspace()', t);
    execute format('alter table public.%I alter column workspace_id set not null', t);
    execute format('create index ix_%s_workspace on public.%I (workspace_id)', t, t);
    -- Дані бачить лише той, хто має доступ до простору, і лише в просторах цього запиту
    execute format($p$create policy %I on public.%I as restrictive for all to authenticated
                     using (workspace_id = any ((select app.visible_workspaces())::uuid[]))
                     with check (app.member_of(workspace_id))$p$, t || '_workspace', t);
  end loop;
end $$;

-- Простір картки не змінюється (перенесення між компаніями — окрема процедура, якщо знадобиться)
create or replace function app.guard_workspace() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'Простір запису змінювати не можна' using errcode = 'check_violation';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['candidates', 'vacancies', 'applications', 'interviews', 'documents',
                           'legal_entities', 'projects', 'sites', 'departments', 'hr_contacts',
                           'email_templates', 'app_settings'] loop
    execute format('create trigger trg_%s_workspace_guard before update on public.%I for each row execute function app.guard_workspace()', t, t);
  end loop;
end $$;

-- Відгук, подія і документ — у просторі вакансії / кандидата; змішувати простори не можна
create or replace function app.applications_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_vac uuid; v_cand uuid;
begin
  select workspace_id into v_vac from public.vacancies where id = new.vacancy_id;
  select workspace_id into v_cand from public.candidates where id = new.candidate_id;
  if v_vac is distinct from v_cand then
    raise exception 'Кандидат і вакансія з різних просторів (KAN Talent / HomeHub)' using errcode = 'check_violation';
  end if;
  new.workspace_id := v_vac;
  return new;
end $$;
create trigger trg_applications_workspace before insert on public.applications
  for each row execute function app.applications_workspace();

create or replace function app.interviews_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.application_id is not null then
    select workspace_id into new.workspace_id from public.applications where id = new.application_id;
  end if;
  return new;
end $$;
create trigger trg_interviews_workspace before insert on public.interviews
  for each row execute function app.interviews_workspace();

create or replace function app.documents_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.candidate_id is not null then
    select workspace_id into new.workspace_id from public.candidates where id = new.candidate_id;
  end if;
  return new;
end $$;
create trigger trg_documents_workspace before insert on public.documents
  for each row execute function app.documents_workspace();

-- Унікальність — у межах простору
alter table public.email_templates drop constraint if exists email_templates_name_key;
create unique index ux_email_templates_ws_name on public.email_templates (workspace_id, name);
alter table public.legal_entities drop constraint if exists legal_entities_name_key;
create unique index ux_legal_entities_ws_name on public.legal_entities (workspace_id, name);
alter table public.projects drop constraint if exists projects_name_key;
create unique index ux_projects_ws_name on public.projects (workspace_id, name);
drop index if exists public.ux_documents_sha256;
create unique index ux_documents_sha256 on public.documents (workspace_id, sha256) where deleted_at is null;
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add primary key (workspace_id, key);

-- ---------------------------------------------------------------------
-- Службові перевірки доступу: картку іншого простору не відкрити навіть за прямим посиланням
-- ---------------------------------------------------------------------
create or replace function app.can_read_candidate_id(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidates c
    where c.id = p_id and c.deleted_at is null and app.member_of(c.workspace_id)
      and app.candidate_in_scope('candidates.read', c.id, c.owner_id))
$$;

create or replace function app.can_update_candidate_id(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidates c
    where c.id = p_id and c.deleted_at is null and app.member_of(c.workspace_id)
      and app.candidate_in_scope('candidates.update', c.id, c.owner_id))
$$;

create or replace function app.can_read_application(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_id and a.deleted_at is null and app.member_of(a.workspace_id)
      and app.application_in_scope('applications.read', a.recruiter_id, a.vacancy_id))
$$;

create or replace function app.can_manage_interviews_for(p_application uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_application and a.deleted_at is null and app.member_of(a.workspace_id)
      and app.application_in_scope('interviews.manage', a.recruiter_id, a.vacancy_id))
$$;

-- ---------------------------------------------------------------------
-- Дублікати — лише в межах поточного простору (бази окремі)
-- ---------------------------------------------------------------------
create or replace function public.find_candidate_duplicates(
  p_phone text default null, p_email text default null, p_linkedin text default null,
  p_full_name text default null, p_city text default null)
returns table (candidate_id uuid, match_type text, matched_on text, score real, owner_id uuid)
language plpgsql stable security definer set search_path = ''
set pg_trgm.similarity_threshold = 0.6 as $$
declare
  v_phone text := app.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(p_email)), '');
  v_li    text := app.normalize_linkedin(p_linkedin);
  v_name  text := nullif(app.search_text(p_full_name), '');
  v_ws    uuid := app.current_workspace();
begin
  if not (app.has_permission('candidates.create') or app.has_permission('candidates.read')) then
    raise exception 'Немає доступу' using errcode = 'insufficient_privilege';
  end if;

  return query
  with exact as (
    select c.id, 'exact'::text as match_type,
           case when v_phone is not null and c.phone_e164 = v_phone then 'phone'
                when v_email is not null and c.email_norm = v_email then 'email'
                else 'linkedin' end as matched_on,
           1.0::real as score, c.owner_id
    from public.candidates c
    where c.deleted_at is null and c.merged_into_id is null and c.workspace_id = v_ws
      and ((v_phone is not null and c.phone_e164 = v_phone)
        or (v_email is not null and c.email_norm = v_email)
        or (v_li is not null and c.linkedin_norm = v_li))
  ),
  fuzzy as (
    select c.id, 'probable'::text, 'name'::text,
           extensions.similarity(app.search_text(c.full_name), v_name),
           c.owner_id
    from public.candidates c
    where v_name is not null
      and c.deleted_at is null and c.merged_into_id is null and c.workspace_id = v_ws
      and app.search_text(c.full_name) operator(extensions.%) v_name
      and extensions.similarity(app.search_text(c.full_name), v_name) >= 0.6
      and (p_city is null or c.city is null or lower(c.city) = lower(p_city))
      and c.id not in (select e.id from exact e)
  )
  select * from exact
  union all
  select * from fuzzy
  order by 4 desc
  limit 20;
end $$;

-- ---------------------------------------------------------------------
-- Доступ до простору: адміністратор користувачів призначає, решта бачить лише себе
-- ---------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
revoke all on public.workspaces, public.workspace_members from anon;
grant select on public.workspaces to authenticated;
grant select, insert, delete on public.workspace_members to authenticated;
grant all on public.workspaces, public.workspace_members to service_role;
create policy workspaces_select on public.workspaces for select to authenticated using (app.is_active_user());
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (user_id = auth.uid() or app.has_permission('users.manage'));
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (app.has_admin_permission('users.manage'));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (app.has_admin_permission('users.manage'));
create trigger trg_workspace_members_audit after insert or update or delete on public.workspace_members
  for each row execute function app.audit_row();

-- Стартові шаблони листів — і для HomeHub
insert into public.email_templates (workspace_id, name, category, subject, body_html, variables, is_active)
select 'a1000000-0000-0000-0000-000000000002', name, category, subject, body_html, variables, is_active
from public.email_templates
where workspace_id = 'a1000000-0000-0000-0000-000000000001' and created_by is null
on conflict do nothing;
