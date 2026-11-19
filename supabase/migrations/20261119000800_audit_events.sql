-- =====================================================================
-- 0008. Журнал дій (лише дописування) і черга подій для автоматизацій
-- =====================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  details     jsonb,
  ip          inet,
  user_agent  text
);
create index ix_audit_entity on public.audit_log (entity, entity_id, at desc);
create index ix_audit_actor  on public.audit_log (actor_id, at desc);
create index ix_audit_at     on public.audit_log (at desc);
comment on table public.audit_log is 'Журнал дій. Змінювати чи видаляти записи заборонено навіть адміністратору.';

-- Журнал не можна змінити; очищення старих записів — лише явною службовою процедурою
create or replace function app.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'Журнал дій змінювати заборонено' using errcode = 'insufficient_privilege';
end $$;
create trigger trg_audit_immutable before update or delete on public.audit_log
  for each row execute function app.audit_log_immutable();

-- Великі та службові колонки не дублюємо в журналі
create or replace function app.audit_strip(j jsonb)
returns jsonb language sql immutable as $$
  select j - array['search_tsv', 'text_tsv', 'extracted_text', 'refresh_token_encrypted', 'body_html', 'raw_json']
$$;

create or replace function app.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_id     text;
  v_action text := lower(tg_op);
begin
  if tg_op in ('UPDATE', 'DELETE') then v_before := app.audit_strip(to_jsonb(old)); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after  := app.audit_strip(to_jsonb(new)); end if;
  v_id := coalesce(v_after ->> 'id', v_before ->> 'id');

  if tg_op = 'UPDATE' then
    if v_before = v_after then return null; end if;
    if (v_before ->> 'deleted_at') is null and (v_after ->> 'deleted_at') is not null then
      v_action := 'soft_delete';
    elsif (v_before ->> 'deleted_at') is not null and (v_after ->> 'deleted_at') is null then
      v_action := 'restore';
    end if;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (auth.uid(), v_action, tg_table_name, v_id, v_before, v_after);
  return null;
end $$;

-- Подія, яку застосунок записує сам: перегляд файлу, експорт, вхід, публікація конфігурації
create or replace function public.log_event(p_action text, p_entity text, p_entity_id text, p_details jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_active_user() then
    raise exception 'Немає доступу' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('view_file', 'download_file', 'export', 'login', 'logout', 'mfa_enrolled',
                      'config_publish', 'config_rollback', 'email_sent', 'gdpr_export', 'gdpr_erase') then
    raise exception 'Невідомий тип події: %', p_action using errcode = 'invalid_parameter_value';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_details);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'roles', 'role_permissions', 'user_roles', 'field_permissions',
    'sources', 'sites', 'departments', 'rejection_reasons', 'pipelines', 'pipeline_stages', 'stage_transitions',
    'candidates', 'candidate_experience', 'candidate_education', 'consents', 'documents',
    'vacancies', 'applications', 'notes',
    'email_accounts', 'email_templates', 'interviews',
    'modules', 'entities', 'fields', 'relations', 'statuses', 'status_transitions',
    'records', 'layouts', 'pages', 'menu_items', 'automations', 'reports', 'config_versions'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
         for each row execute function app.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Черга подій (outbox) для рушія автоматизацій. Читає лише фоновий воркер.
-- ---------------------------------------------------------------------
create table public.events (
  id            bigint generated always as identity primary key,
  type          text not null,
  entity        text not null,
  entity_id     uuid not null,
  payload       jsonb not null default '{}',
  actor_id      uuid,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  attempts      int not null default 0,
  last_error    text
);
create index ix_events_pending on public.events (id) where processed_at is null;

create or replace function app.emit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if tg_table_name = 'applications' then
    if tg_op = 'INSERT' then
      v_type := 'application.created';
    elsif new.stage_id is distinct from old.stage_id then
      v_type := 'application.stage_changed';
    else
      return null;
    end if;
    insert into public.events (type, entity, entity_id, payload, actor_id)
    values (v_type, 'applications', new.id,
            jsonb_build_object('candidate_id', new.candidate_id, 'vacancy_id', new.vacancy_id,
                               'stage_id', new.stage_id,
                               'from_stage_id', case when tg_op = 'UPDATE' then old.stage_id end),
            auth.uid());
  elsif tg_table_name = 'candidates' then
    insert into public.events (type, entity, entity_id, actor_id)
    values ('candidate.created', 'candidates', new.id, auth.uid());
  elsif tg_table_name = 'email_messages' then
    if new.direction = 'in' then
      insert into public.events (type, entity, entity_id, payload, actor_id)
      values ('email.received', 'email_messages', new.id,
              jsonb_build_object('candidate_id', new.candidate_id, 'application_id', new.application_id), null);
    end if;
  elsif tg_table_name = 'records' then
    if tg_op = 'INSERT' then
      v_type := 'record.created';
    elsif new.status_id is distinct from old.status_id then
      v_type := 'record.status_changed';
    else
      return null;
    end if;
    insert into public.events (type, entity, entity_id, payload, actor_id)
    values (v_type, 'records', new.id,
            jsonb_build_object('entity_id', new.entity_id, 'status_id', new.status_id), auth.uid());
  end if;
  return null;
end $$;

create trigger trg_applications_events after insert or update of stage_id on public.applications
  for each row execute function app.emit_event();
create trigger trg_candidates_events after insert on public.candidates
  for each row execute function app.emit_event();
create trigger trg_email_events after insert on public.email_messages
  for each row execute function app.emit_event();
create trigger trg_records_events after insert or update of status_id on public.records
  for each row execute function app.emit_event();

create table public.automation_runs (
  id             bigint generated always as identity primary key,
  automation_id  uuid not null references public.automations(id) on delete cascade,
  event_id       bigint references public.events(id) on delete set null,
  status         text not null check (status in ('success', 'failed', 'skipped', 'awaiting_confirmation')),
  detail         jsonb,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index ix_automation_runs on public.automation_runs (automation_id, started_at desc);
