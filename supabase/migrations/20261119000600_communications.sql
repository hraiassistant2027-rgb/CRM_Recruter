-- =====================================================================
-- 0006. Пошта (Gmail) і співбесіди (Google Calendar)
-- =====================================================================

create table public.email_accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references public.profiles(id) on delete cascade,
  google_email             text not null,
  refresh_token_encrypted  bytea,
  token_key_id             text,
  scopes                   text[] not null default '{}',
  history_id               text,
  watch_expires_at         timestamptz,
  status                   text not null default 'active' check (status in ('active', 'revoked', 'error', 'disconnected')),
  last_sync_at             timestamptz,
  last_error               text,
  connected_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
comment on column public.email_accounts.refresh_token_encrypted is
  'Зашифровано на рівні застосунку (AES-256-GCM). Колонка недоступна ролі authenticated.';
create trigger trg_email_accounts_updated before update on public.email_accounts
  for each row execute function app.set_updated_at();

create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null default 'custom'
              check (category in ('invite', 'next_stage', 'rejection', 'received', 'offer', 'custom')),
  subject     text not null,
  body_html   text not null,
  variables   text[] not null default '{}',
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_email_templates_updated before update on public.email_templates
  for each row execute function app.set_updated_at();

create table public.email_messages (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  application_id    uuid references public.applications(id) on delete set null,
  account_id        uuid references public.email_accounts(id) on delete set null,
  direction         text not null check (direction in ('out', 'in')),
  gmail_message_id  text,
  gmail_thread_id   text,
  rfc_message_id    text,
  from_email        text,
  to_emails         text[] not null default '{}',
  cc_emails         text[] not null default '{}',
  subject           text,
  body_html         text,
  body_text         text,
  snippet           text,
  status            text not null default 'draft'
                    check (status in ('draft', 'queued', 'sent', 'failed', 'bounced', 'received')),
  error             text,
  template_id       uuid references public.email_templates(id) on delete set null,
  sent_by           uuid references public.profiles(id) default auth.uid(),
  sent_at           timestamptz,
  received_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index ux_email_gmail_id on public.email_messages (gmail_message_id) where gmail_message_id is not null;
create index ix_email_candidate on public.email_messages (candidate_id, created_at desc);
create index ix_email_thread    on public.email_messages (gmail_thread_id);
create trigger trg_email_messages_updated before update on public.email_messages
  for each row execute function app.set_updated_at();

create table public.interviews (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.applications(id) on delete cascade,
  kind             text not null default 'other' check (kind in ('phone', 'manager', 'repeat', 'other')),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  location         text,
  meet_link        text,
  google_event_id  text,
  calendar_id      text,
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'rescheduled', 'cancelled', 'done', 'no_show')),
  result           text,
  organizer_id     uuid references public.profiles(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index ix_interviews_app  on public.interviews (application_id);
create index ix_interviews_time on public.interviews (starts_at) where status in ('scheduled', 'rescheduled');
create trigger trg_interviews_updated before update on public.interviews
  for each row execute function app.set_updated_at();

create table public.interview_participants (
  id               uuid primary key default gen_random_uuid(),
  interview_id     uuid not null references public.interviews(id) on delete cascade,
  user_id          uuid references public.profiles(id),
  email            text,
  display_name     text,
  response_status  text not null default 'needsAction'
                   check (response_status in ('needsAction', 'accepted', 'declined', 'tentative')),
  check (user_id is not null or email is not null)
);
create index ix_participants_interview on public.interview_participants (interview_id);
