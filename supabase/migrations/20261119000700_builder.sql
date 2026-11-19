-- =====================================================================
-- 0007. Конструктор CRM: метадані модулів, дані модулів, версії конфігурації
-- =====================================================================
-- Робоча (опублікована) конфігурація живе в таблицях нижче.
-- Зміни адміністратора спершу пишуться в чернетку config_versions
-- і потрапляють сюди лише через функцію публікації (етап 8).

create table public.modules (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  name         text not null,
  icon         text,
  description  text,
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.entities (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid references public.modules(id) on delete restrict,
  code          text not null unique check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  name          text not null,
  name_plural   text,
  is_system     boolean not null default false,
  system_table  text,
  title_field   text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  check ((is_system and system_table is not null) or (not is_system and system_table is null))
);
comment on table public.entities is 'Сутності: системні (кандидати, вакансії, відгуки) і створені в конструкторі.';

create table public.fields (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references public.entities(id) on delete restrict,
  code                text not null check (code ~ '^[a-z][a-z0-9_]{0,62}$'),
  name                text not null,
  type                text not null check (type in (
                        'text', 'long_text', 'number', 'money', 'date', 'datetime', 'boolean',
                        'select', 'multiselect', 'user', 'file', 'relation', 'formula',
                        'email', 'phone', 'url')),
  is_required         boolean not null default false,
  is_system           boolean not null default false,
  default_value       jsonb,
  options             jsonb not null default '[]',
  validation          jsonb not null default '{}',
  relation_entity_id  uuid references public.entities(id),
  formula             text,
  sort_order          int not null default 0,
  archived_at         timestamptz,
  unique (entity_id, code),
  check (type <> 'relation' or relation_entity_id is not null),
  check (type <> 'formula' or formula is not null)
);
comment on column public.fields.archived_at is 'Поле не видаляється, а архівується: дані залишаються і повертаються разом із полем.';

create table public.relations (
  id              uuid primary key default gen_random_uuid(),
  from_entity_id  uuid not null references public.entities(id) on delete restrict,
  to_entity_id    uuid not null references public.entities(id) on delete restrict,
  kind            text not null check (kind in ('one_to_many', 'many_to_many')),
  code            text not null check (code ~ '^[a-z][a-z0-9_]{0,62}$'),
  name            text not null,
  unique (from_entity_id, code)
);

create table public.statuses (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references public.entities(id) on delete restrict,
  code         text not null check (code ~ '^[a-z][a-z0-9_]{0,62}$'),
  name         text not null,
  color        text not null default '#9CA3AF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   int not null default 0,
  is_final     boolean not null default false,
  archived_at  timestamptz,
  unique (entity_id, code)
);

create table public.status_transitions (
  id               uuid primary key default gen_random_uuid(),
  from_status_id   uuid not null references public.statuses(id) on delete cascade,
  to_status_id     uuid not null references public.statuses(id) on delete cascade,
  required_fields  text[] not null default '{}',
  required_action  text,
  unique (from_status_id, to_status_id),
  check (from_status_id <> to_status_id)
);

create table public.records (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references public.entities(id) on delete restrict,
  data          jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  status_id     uuid references public.statuses(id),
  owner_id      uuid references public.profiles(id) default auth.uid(),
  candidate_id  uuid references public.candidates(id) on delete cascade,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
comment on table public.records is 'Дані модулів, створених у конструкторі. Структура data описана в fields.';
create index ix_records_entity     on public.records (entity_id, created_at desc) where deleted_at is null;
create index ix_records_data       on public.records using gin (data jsonb_path_ops);
create index ix_records_candidate  on public.records (candidate_id);
create trigger trg_records_updated before update on public.records
  for each row execute function app.set_updated_at();

create or replace function app.records_check_entity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.entities%rowtype;
begin
  select * into v from public.entities where id = new.entity_id;
  if v.is_system then
    raise exception 'Записи системних сутностей зберігаються у власних таблицях' using errcode = 'check_violation';
  end if;
  if v.archived_at is not null and tg_op = 'INSERT' then
    raise exception 'Сутність «%» архівовано', v.name using errcode = 'check_violation';
  end if;
  if new.status_id is not null and not exists (
       select 1 from public.statuses s where s.id = new.status_id and s.entity_id = new.entity_id) then
    raise exception 'Статус не належить цій сутності' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_records_check before insert or update of entity_id, status_id on public.records
  for each row execute function app.records_check_entity();

create table public.record_links (
  id              uuid primary key default gen_random_uuid(),
  relation_id     uuid not null references public.relations(id) on delete restrict,
  from_record_id  uuid not null references public.records(id) on delete cascade,
  to_id           uuid not null,
  created_by      uuid references public.profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (relation_id, from_record_id, to_id)
);
comment on column public.record_links.to_id is 'Ідентифікатор запису цільової сутності (records або системної таблиці).';
create index ix_record_links_to on public.record_links (to_id);

create table public.layouts (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.entities(id) on delete restrict,
  kind        text not null check (kind in ('card', 'form', 'list')),
  name        text not null,
  definition  jsonb not null default '{}',
  is_default  boolean not null default false
);
create unique index ux_layouts_default on public.layouts (entity_id, kind) where is_default;

create table public.pages (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid references public.modules(id) on delete restrict,
  code        text not null unique check (code ~ '^[a-z][a-z0-9_-]{1,62}$'),
  name        text not null,
  definition  jsonb not null default '{"blocks": []}'
);

create table public.menu_items (
  id                   uuid primary key default gen_random_uuid(),
  parent_id            uuid references public.menu_items(id) on delete restrict,
  name                 text not null,
  icon                 text,
  sort_order           int not null default 0,
  target_type          text not null check (target_type in ('system', 'page', 'module', 'url', 'group')),
  target_ref           text,
  required_permission  text references public.permissions(code) on update cascade,
  admin_only           boolean not null default false,
  is_visible           boolean not null default true
);

create table public.automations (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid references public.modules(id) on delete restrict,
  name        text not null,
  is_active   boolean not null default false,
  trigger     jsonb not null,
  conditions  jsonb not null default '{"all": []}',
  actions     jsonb not null default '[]',
  owner_id    uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column public.automations.trigger is 'Тригер: {"type": "status_changed" | "record_created" | "no_contact_days" | "email_received" | "schedule", ...}';

alter table public.tasks
  add constraint fk_tasks_automation foreign key (automation_id)
  references public.automations(id) on delete set null;

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  definition  jsonb not null,
  owner_id    uuid references public.profiles(id) default auth.uid(),
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.config_versions (
  id            uuid primary key default gen_random_uuid(),
  version_no    int generated always as identity unique,
  status        text not null default 'draft' check (status in ('draft', 'published', 'superseded', 'discarded')),
  snapshot      jsonb not null,
  validation    jsonb,
  comment       text,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  published_by  uuid references public.profiles(id),
  published_at  timestamptz
);
create unique index ux_config_one_published on public.config_versions (status) where status = 'published';
comment on table public.config_versions is 'Знімки конфігурації CRM: чернетки, опублікована версія, історія для відкату.';

create trigger trg_modules_updated before update on public.modules
  for each row execute function app.set_updated_at();
create trigger trg_automations_updated before update on public.automations
  for each row execute function app.set_updated_at();
create trigger trg_reports_updated before update on public.reports
  for each row execute function app.set_updated_at();
