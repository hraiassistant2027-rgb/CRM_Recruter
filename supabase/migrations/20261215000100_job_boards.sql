-- =====================================================================
-- Сайти вакансій (robota.ua): кабінети роботодавця, їхні вакансії та імпортовані відгуки.
-- Кабінетів може бути кілька в кожному просторі (KAN Talent / HomeHub).
-- Пароль і токен зберігаються зашифрованими і недоступні браузеру:
-- клієнт бачить лише безпечні колонки, усі зміни — через сервер (service_role).
-- =====================================================================
create table public.job_board_accounts (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null default app.current_workspace() references public.workspaces(id),
  provider            text not null default 'robota_ua' check (provider in ('robota_ua')),
  label               text not null check (length(trim(label)) between 1 and 100),
  login               text not null check (length(trim(login)) between 3 and 200),
  password_encrypted  bytea not null,
  token_encrypted     bytea,
  token_expires_at    timestamptz,
  status              text not null default 'active' check (status in ('active', 'error')),
  last_sync_at        timestamptz,
  last_error          text check (last_error is null or length(last_error) <= 500),
  imported_total      int not null default 0,
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  unique (workspace_id, provider, login)
);
comment on table public.job_board_accounts is 'Кабінети роботодавця на сайтах вакансій. Пароль/токен — лише для сервера.';

create table public.job_board_vacancies (
  account_id     uuid not null references public.job_board_accounts(id) on delete cascade,
  external_id    bigint not null,
  workspace_id   uuid not null references public.workspaces(id),
  name           text not null default '',
  state          text,
  city           text,
  vacancy_id     uuid references public.vacancies(id) on delete set null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (account_id, external_id)
);
comment on table public.job_board_vacancies is 'Вакансії з кабінету на сайті і з якою вакансією CRM вони пов''язані.';
create index ix_job_board_vacancies_vacancy on public.job_board_vacancies (vacancy_id);

create table public.job_board_applies (
  account_id           uuid not null references public.job_board_accounts(id) on delete cascade,
  external_id          bigint not null,
  external_vacancy_id  bigint not null,
  workspace_id         uuid not null references public.workspaces(id),
  candidate_id         uuid references public.candidates(id) on delete set null,
  application_id       uuid references public.applications(id) on delete set null,
  imported_at          timestamptz not null default now(),
  primary key (account_id, external_id)
);
comment on table public.job_board_applies is 'Відгуки з сайту, вже перенесені в CRM (щоб не імпортувати двічі).';
create index ix_job_board_applies_vacancy on public.job_board_applies (account_id, external_vacancy_id) where application_id is null;

alter table public.job_board_accounts  enable row level security;
alter table public.job_board_vacancies enable row level security;
alter table public.job_board_applies   enable row level security;

-- Браузер: лише читання і лише безпечних колонок
grant select (id, workspace_id, provider, label, login, status, last_sync_at, last_error, imported_total, created_at)
  on public.job_board_accounts to authenticated;
grant select on public.job_board_vacancies, public.job_board_applies to authenticated;
grant all on public.job_board_accounts, public.job_board_vacancies, public.job_board_applies to service_role;

create policy job_board_accounts_select on public.job_board_accounts for select to authenticated
  using (app.has_permission('settings.manage'));
create policy job_board_vacancies_select on public.job_board_vacancies for select to authenticated
  using (app.is_active_user());
create policy job_board_applies_select on public.job_board_applies for select to authenticated
  using (app.is_active_user());

create policy job_board_accounts_workspace on public.job_board_accounts as restrictive for all to authenticated
  using (workspace_id = any ((select app.visible_workspaces())::uuid[]));
create policy job_board_vacancies_workspace on public.job_board_vacancies as restrictive for all to authenticated
  using (workspace_id = any ((select app.visible_workspaces())::uuid[]));
create policy job_board_applies_workspace on public.job_board_applies as restrictive for all to authenticated
  using (workspace_id = any ((select app.visible_workspaces())::uuid[]));
