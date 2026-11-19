-- =====================================================================
-- 0003. Довідники та воронка рекрутингу
-- =====================================================================

create table public.sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
comment on table public.sources is 'Джерела кандидатів (Work.ua, robota.ua, рекомендація...).';

create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  region      text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.sites is 'Будівельні об''єкти.';

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references public.departments(id) on delete restrict,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.rejection_reasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  side        text not null check (side in ('company', 'candidate')),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  unique (name, side)
);
comment on column public.rejection_reasons.side is 'company = відмовила компанія; candidate = відмовився кандидат.';

create table public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index ux_pipelines_one_default on public.pipelines (is_default) where is_default;

create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid not null references public.pipelines(id) on delete restrict,
  code         text not null check (code ~ '^[a-z][a-z0-9_]{1,62}$'),
  name         text not null,
  color        text not null default '#9CA3AF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   int not null,
  kind         text not null default 'open'
               check (kind in ('open', 'offer', 'hired', 'rejected', 'withdrawn')),
  sla_days     int check (sla_days is null or sla_days > 0),
  is_active    boolean not null default true,
  unique (pipeline_id, code),
  unique (pipeline_id, sort_order) deferrable initially deferred
);
comment on column public.pipeline_stages.kind is
  'Тип етапу для аналітики: open, offer, hired (працевлаштований), rejected (відмова компанії), withdrawn (кандидат відмовився).';

-- Якщо для етапу задано хоча б один перехід, дозволені лише задані переходи.
create table public.stage_transitions (
  id               uuid primary key default gen_random_uuid(),
  from_stage_id    uuid not null references public.pipeline_stages(id) on delete cascade,
  to_stage_id      uuid not null references public.pipeline_stages(id) on delete cascade,
  required_fields  text[] not null default '{}',
  required_action  text,
  unique (from_stage_id, to_stage_id),
  check (from_stage_id <> to_stage_id)
);
comment on column public.stage_transitions.required_fields is 'Поля відгуку (applications), які мають бути заповнені для переходу.';

create trigger trg_sites_updated before update on public.sites
  for each row execute function app.set_updated_at();
