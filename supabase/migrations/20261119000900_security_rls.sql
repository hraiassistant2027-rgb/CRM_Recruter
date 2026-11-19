-- =====================================================================
-- 0009. Права доступу на рівні бази: GRANT + Row Level Security
-- =====================================================================
-- Принцип: браузер не має прямого доступу до БД. API (BFF) передає в БД токен
-- користувача, тому ці правила діють для кожного запиту, навіть якщо в коді API
-- є помилка. Фоновий воркер працює з роллю service_role (обходить RLS).

-- ---------------------------------------------------------------------
-- Функції області доступу ('all' / 'own')
-- ---------------------------------------------------------------------

-- Кандидат «свій», якщо користувач — власник картки, рекрутер відгуку,
-- рекрутер або керівник-замовник вакансії, на яку подано відгук.
create or replace function app.candidate_in_scope(p_code text, p_id uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case app.permission_scope(p_code)
    when 'all' then true
    when 'own' then p_owner = auth.uid() or exists (
      select 1
      from public.applications a
      join public.vacancies v on v.id = a.vacancy_id
      where a.candidate_id = p_id and a.deleted_at is null
        and auth.uid() in (a.recruiter_id, v.recruiter_id, v.hiring_manager_id))
    else false
  end
$$;

create or replace function app.can_read_candidate_id(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidates c
    where c.id = p_id and c.deleted_at is null
      and app.candidate_in_scope('candidates.read', c.id, c.owner_id))
$$;

create or replace function app.can_update_candidate_id(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.candidates c
    where c.id = p_id and c.deleted_at is null
      and app.candidate_in_scope('candidates.update', c.id, c.owner_id))
$$;

create or replace function app.vacancy_in_scope(p_code text, p_recruiter uuid, p_manager uuid)
returns boolean language sql stable as $$
  select case app.permission_scope(p_code)
    when 'all' then true
    when 'own' then auth.uid() in (p_recruiter, p_manager)
    else false
  end
$$;

create or replace function app.application_in_scope(p_code text, p_recruiter uuid, p_vacancy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case app.permission_scope(p_code)
    when 'all' then true
    when 'own' then p_recruiter = auth.uid() or exists (
      select 1 from public.vacancies v
      where v.id = p_vacancy and auth.uid() in (v.recruiter_id, v.hiring_manager_id))
    else false
  end
$$;

create or replace function app.can_read_application(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_id and a.deleted_at is null
      and app.application_in_scope('applications.read', a.recruiter_id, a.vacancy_id))
$$;

create or replace function app.can_read_interview(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.interviews i
    where i.id = p_id and app.can_read_application(i.application_id))
$$;

create or replace function app.can_read_document(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_id and d.deleted_at is null
      and (
        (d.candidate_id is null and (d.uploaded_by = auth.uid() or app.has_permission_all('candidates.read')))
        or (d.candidate_id is not null and app.can_read_candidate_id(d.candidate_id))
      ))
$$;

-- Дозволи модулів конструктора: entity:<код сутності>.<read|create|update|delete>
create or replace function app.entity_scope(p_entity uuid, p_action text)
returns text language sql stable security definer set search_path = '' as $$
  select app.permission_scope('entity:' || e.code || '.' || p_action)
  from public.entities e where e.id = p_entity
$$;

create or replace function app.record_in_scope(p_entity uuid, p_action text, p_owner uuid)
returns boolean language sql stable as $$
  select case app.entity_scope(p_entity, p_action)
    when 'all' then true
    when 'own' then p_owner = auth.uid()
    else false
  end
$$;

create or replace function app.can_read_record(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.records r
                 where r.id = p_id and r.deleted_at is null
                   and app.record_in_scope(r.entity_id, 'read', r.owner_id))
$$;

create or replace function app.can_update_record(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.records r
                 where r.id = p_id and r.deleted_at is null
                   and app.record_in_scope(r.entity_id, 'update', r.owner_id))
$$;

-- ---------------------------------------------------------------------
-- М'яке видалення і відновлення — окремими дозволами
-- ---------------------------------------------------------------------
create or replace function app.guard_soft_delete()
returns trigger language plpgsql as $$
declare
  v_prefix text := tg_argv[0];
begin
  if current_user <> 'authenticated' then
    return new;  -- службові ролі (воркер, міграції)
  end if;
  if tg_table_name = 'records' then
    select 'entity:' || e.code into v_prefix from public.entities e where e.id = new.entity_id;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    if not app.has_permission(v_prefix || '.delete') then
      raise exception 'Немає права видаляти записи (%)', v_prefix using errcode = 'insufficient_privilege';
    end if;
    if tg_table_name = 'candidates' then new.deleted_by := auth.uid(); end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    if not app.has_permission(v_prefix || '.restore') then
      raise exception 'Немає права відновлювати записи (%)', v_prefix using errcode = 'insufficient_privilege';
    end if;
    if tg_table_name = 'candidates' then new.deleted_by := null; end if;
  end if;
  return new;
end $$;

create trigger trg_candidates_soft_delete before update of deleted_at on public.candidates
  for each row execute function app.guard_soft_delete('candidates');
create trigger trg_documents_soft_delete before update of deleted_at on public.documents
  for each row execute function app.guard_soft_delete('candidates');
create trigger trg_vacancies_soft_delete before update of deleted_at on public.vacancies
  for each row execute function app.guard_soft_delete('vacancies');
create trigger trg_applications_soft_delete before update of deleted_at on public.applications
  for each row execute function app.guard_soft_delete('applications');
create trigger trg_records_soft_delete before update of deleted_at on public.records
  for each row execute function app.guard_soft_delete('records');

-- ---------------------------------------------------------------------
-- Захист профілів: користувач не може сам себе розблокувати чи вимкнути MFA,
-- і в системі завжди лишається хоча б один активний SUPER ADMIN
-- ---------------------------------------------------------------------
create or replace function app.active_super_admins_excluding(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.code = 'super_admin'
  join public.profiles p on p.id = ur.user_id and p.is_active
  where ur.user_id <> p_user
$$;

create or replace function app.guard_profile()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
     and (new.is_active is distinct from old.is_active or new.mfa_required is distinct from old.mfa_required
          or new.email is distinct from old.email)
     and not app.has_admin_permission('users.manage') then
    raise exception 'Змінювати статус, email і вимоги MFA може лише адміністратор' using errcode = 'insufficient_privilege';
  end if;
  if old.is_active and not new.is_active
     and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = new.id and r.code = 'super_admin')
     and app.active_super_admins_excluding(new.id) = 0 then
    raise exception 'Не можна заблокувати останнього SUPER ADMIN' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function app.guard_profile();

create or replace function app.guard_last_super_admin()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.roles r where r.id = old.role_id and r.code = 'super_admin')
     and app.active_super_admins_excluding(old.user_id) = 0 then
    raise exception 'Не можна забрати роль в останнього SUPER ADMIN' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger trg_user_roles_last_admin before delete on public.user_roles
  for each row execute function app.guard_last_super_admin();

-- ---------------------------------------------------------------------
-- Пошук дублікатів (бачить усю базу, але повертає лише ідентифікатори)
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
    where c.deleted_at is null and c.merged_into_id is null
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
      and c.deleted_at is null and c.merged_into_id is null
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
-- GRANT: anon — нічого; authenticated — без DELETE (крім таблиць-зв'язок)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on function public.find_candidate_duplicates(text, text, text, text, text) from public, anon;
revoke execute on function public.log_event(text, text, text, jsonb) from public, anon;
grant execute on function public.find_candidate_duplicates(text, text, text, text, text) to authenticated;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated;

grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant delete on public.role_permissions, public.user_roles, public.field_permissions,
                public.stage_transitions, public.candidate_experience, public.candidate_education,
                public.record_links, public.interview_participants
  to authenticated;

-- лише для читання або взагалі недоступні користувачам
revoke insert, update on public.audit_log, public.application_stage_history,
                         public.automation_runs, public.permissions
  from authenticated;
revoke all on public.events from authenticated;

-- метадані конструктора змінюються лише функцією публікації
revoke insert, update on public.modules, public.entities, public.fields, public.relations,
                         public.statuses, public.status_transitions, public.layouts,
                         public.pages, public.menu_items, public.automations
  from authenticated;

-- токени пошти недоступні навіть власнику скриньки
revoke select, insert, update on public.email_accounts from authenticated;
grant select (id, user_id, google_email, scopes, status, last_sync_at, last_error, connected_at)
  on public.email_accounts to authenticated;
grant update (status) on public.email_accounts to authenticated;

-- профіль: користувач може змінити лише ім'я і телефон (статус — лише адміністратор, див. trigger)
revoke update on public.profiles from authenticated;
grant update (full_name, phone, is_active, mfa_required) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- RLS увімкнено для всіх таблиць схеми public
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Користувачі та права
create policy profiles_select on public.profiles for select to authenticated
  using (app.is_active_user());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app.has_admin_permission('users.manage'))
  with check (id = auth.uid() or app.has_admin_permission('users.manage'));

do $$
declare t text;
begin
  foreach t in array array['roles', 'role_permissions', 'user_roles', 'field_permissions'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated using (app.is_active_user());
      create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.has_admin_permission('roles.manage'));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (app.has_admin_permission('roles.manage')) with check (app.has_admin_permission('roles.manage'));
      create policy %1$s_delete on public.%1$I for delete to authenticated using (app.has_admin_permission('roles.manage'));
    $f$, t);
  end loop;
end $$;
create policy permissions_select on public.permissions for select to authenticated using (app.is_active_user());

-- Довідники та налаштування воронки
do $$
declare t text;
begin
  foreach t in array array['sources', 'sites', 'departments', 'rejection_reasons',
                           'pipelines', 'pipeline_stages', 'stage_transitions'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated using (app.is_active_user());
      create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.has_permission('settings.manage'));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
    $f$, t);
  end loop;
end $$;
create policy stage_transitions_delete on public.stage_transitions for delete to authenticated
  using (app.has_permission('settings.manage'));

-- Кандидати
create policy candidates_select on public.candidates for select to authenticated
  using ((deleted_at is null and app.candidate_in_scope('candidates.read', id, owner_id))
         or (deleted_at is not null and app.has_permission('candidates.restore')));
create policy candidates_insert on public.candidates for insert to authenticated
  with check (app.has_permission('candidates.create'));
create policy candidates_update on public.candidates for update to authenticated
  using (((deleted_at is null) or app.has_permission('candidates.restore'))
         and app.candidate_in_scope('candidates.update', id, owner_id))
  with check (app.candidate_in_scope('candidates.update', id, owner_id));

do $$
declare t text;
begin
  foreach t in array array['candidate_experience', 'candidate_education', 'consents'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated using (app.can_read_candidate_id(candidate_id));
      create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.can_update_candidate_id(candidate_id));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (app.can_update_candidate_id(candidate_id)) with check (app.can_update_candidate_id(candidate_id));
    $f$, t);
  end loop;
end $$;
create policy candidate_experience_delete on public.candidate_experience for delete to authenticated
  using (app.can_update_candidate_id(candidate_id));
create policy candidate_education_delete on public.candidate_education for delete to authenticated
  using (app.can_update_candidate_id(candidate_id));

-- Резюме та імпорт
create policy documents_select on public.documents for select to authenticated
  using (app.can_read_document(id));
create policy documents_insert on public.documents for insert to authenticated
  with check (app.has_permission('candidates.create') and uploaded_by = auth.uid()
              and (candidate_id is null or app.can_update_candidate_id(candidate_id)));
create policy documents_update on public.documents for update to authenticated
  using (app.can_read_document(id) and app.has_permission('candidates.update'))
  with check (candidate_id is null or app.can_update_candidate_id(candidate_id));

create policy import_batches_select on public.import_batches for select to authenticated
  using (uploaded_by = auth.uid() or app.has_permission_all('import.manage'));
create policy import_batches_insert on public.import_batches for insert to authenticated
  with check (app.has_permission('candidates.create') and uploaded_by = auth.uid()
              and (mode = 'regular' or app.has_permission('import.manage')));
create policy import_batches_update on public.import_batches for update to authenticated
  using (uploaded_by = auth.uid() or app.has_permission_all('import.manage'))
  with check (uploaded_by = auth.uid() or app.has_permission_all('import.manage'));

create policy parse_results_select on public.parse_results for select to authenticated
  using (app.can_read_document(document_id));
create policy parse_results_update on public.parse_results for update to authenticated
  using (app.can_read_document(document_id) and app.has_permission('candidates.create'))
  with check (app.has_permission('candidates.create'));

-- Вакансії та відгуки
create policy vacancies_select on public.vacancies for select to authenticated
  using (deleted_at is null and app.vacancy_in_scope('vacancies.read', recruiter_id, hiring_manager_id));
create policy vacancies_insert on public.vacancies for insert to authenticated
  with check (app.has_permission('vacancies.manage'));
create policy vacancies_update on public.vacancies for update to authenticated
  using (app.vacancy_in_scope('vacancies.manage', recruiter_id, hiring_manager_id))
  with check (app.vacancy_in_scope('vacancies.manage', recruiter_id, hiring_manager_id));

create policy applications_select on public.applications for select to authenticated
  using (deleted_at is null and app.application_in_scope('applications.read', recruiter_id, vacancy_id));
create policy applications_insert on public.applications for insert to authenticated
  with check (app.has_permission('applications.create') and app.can_read_candidate_id(candidate_id)
              and app.application_in_scope('applications.create', recruiter_id, vacancy_id));
create policy applications_update on public.applications for update to authenticated
  using (app.application_in_scope('applications.update', recruiter_id, vacancy_id))
  with check (app.application_in_scope('applications.update', recruiter_id, vacancy_id));

create policy stage_history_select on public.application_stage_history for select to authenticated
  using (app.can_read_application(application_id));

create policy notes_select on public.notes for select to authenticated
  using (deleted_at is null and app.can_read_candidate_id(candidate_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (author_id = auth.uid() and app.can_read_candidate_id(candidate_id));
create policy notes_update on public.notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy tasks_select on public.tasks for select to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or app.has_permission_all('tasks.read'));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.has_permission('tasks.create'));
create policy tasks_update on public.tasks for update to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid() or app.has_permission_all('tasks.read'))
  with check (assignee_id = auth.uid() or created_by = auth.uid() or app.has_permission_all('tasks.read'));

-- Пошта і співбесіди
create policy email_accounts_select on public.email_accounts for select to authenticated
  using (user_id = auth.uid() or app.has_permission_all('email.accounts.manage'));
create policy email_accounts_update on public.email_accounts for update to authenticated
  using (user_id = auth.uid() or app.has_admin_permission('email.accounts.manage'))
  with check (status in ('active', 'disconnected', 'revoked', 'error'));

create policy email_templates_select on public.email_templates for select to authenticated
  using (app.is_active_user());
create policy email_templates_insert on public.email_templates for insert to authenticated
  with check (app.has_permission('templates.manage'));
create policy email_templates_update on public.email_templates for update to authenticated
  using (app.has_permission('templates.manage')) with check (app.has_permission('templates.manage'));

create policy email_messages_select on public.email_messages for select to authenticated
  using (app.has_permission('email.read') and app.can_read_candidate_id(candidate_id));
create policy email_messages_insert on public.email_messages for insert to authenticated
  with check (app.has_permission('email.send') and direction = 'out' and status in ('draft', 'queued')
              and sent_by = auth.uid() and app.can_read_candidate_id(candidate_id));
create policy email_messages_update on public.email_messages for update to authenticated
  using (sent_by = auth.uid() and status = 'draft')
  with check (sent_by = auth.uid() and status in ('draft', 'queued'));

create policy interviews_select on public.interviews for select to authenticated
  using (app.can_read_application(application_id));
create policy interviews_insert on public.interviews for insert to authenticated
  with check (app.has_permission('interviews.manage') and app.can_read_application(application_id));
create policy interviews_update on public.interviews for update to authenticated
  using (app.has_permission('interviews.manage') and app.can_read_application(application_id))
  with check (app.has_permission('interviews.manage') and app.can_read_application(application_id));

create policy participants_select on public.interview_participants for select to authenticated
  using (app.can_read_interview(interview_id));
create policy participants_insert on public.interview_participants for insert to authenticated
  with check (app.has_permission('interviews.manage') and app.can_read_interview(interview_id));
create policy participants_update on public.interview_participants for update to authenticated
  using (app.has_permission('interviews.manage') and app.can_read_interview(interview_id))
  with check (app.has_permission('interviews.manage') and app.can_read_interview(interview_id));
create policy participants_delete on public.interview_participants for delete to authenticated
  using (app.has_permission('interviews.manage') and app.can_read_interview(interview_id));

-- Журнал дій
create policy audit_select on public.audit_log for select to authenticated
  using (app.has_permission_all('audit.read'));

-- Конструктор: метадані читають усі активні користувачі (потрібно для інтерфейсу)
do $$
declare t text;
begin
  foreach t in array array['modules', 'entities', 'fields', 'relations', 'statuses',
                           'status_transitions', 'layouts', 'pages', 'menu_items'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (app.is_active_user())', t);
  end loop;
end $$;
create policy automations_select on public.automations for select to authenticated
  using (app.has_permission('builder.edit'));
create policy automation_runs_select on public.automation_runs for select to authenticated
  using (app.has_permission('builder.edit'));

create policy records_select on public.records for select to authenticated
  using (deleted_at is null and app.record_in_scope(entity_id, 'read', owner_id));
create policy records_insert on public.records for insert to authenticated
  with check (app.record_in_scope(entity_id, 'create', owner_id));
create policy records_update on public.records for update to authenticated
  using (app.record_in_scope(entity_id, 'update', owner_id))
  with check (app.record_in_scope(entity_id, 'update', owner_id));

create policy record_links_select on public.record_links for select to authenticated
  using (app.can_read_record(from_record_id));
create policy record_links_insert on public.record_links for insert to authenticated
  with check (app.can_update_record(from_record_id));
create policy record_links_delete on public.record_links for delete to authenticated
  using (app.can_update_record(from_record_id));

create policy reports_select on public.reports for select to authenticated
  using (owner_id = auth.uid() or (is_shared and app.has_permission('reports.read')));
create policy reports_insert on public.reports for insert to authenticated
  with check (app.has_permission('reports.create') and owner_id = auth.uid());
create policy reports_update on public.reports for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy config_select on public.config_versions for select to authenticated
  using (app.has_permission('builder.edit'));
create policy config_insert on public.config_versions for insert to authenticated
  with check (app.has_permission('builder.edit') and status = 'draft');
create policy config_update on public.config_versions for update to authenticated
  using (app.has_permission('builder.edit') and status = 'draft')
  with check (status in ('draft', 'discarded'));
