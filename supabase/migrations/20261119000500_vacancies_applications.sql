-- =====================================================================
-- 0005. Вакансії, відгуки (участь кандидата у відборі), історія, нотатки, задачі
-- =====================================================================

create table public.vacancies (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null check (length(trim(title)) > 0),
  site_id              uuid references public.sites(id),
  department_id        uuid references public.departments(id),
  hiring_manager_name  text,
  hiring_manager_id    uuid references public.profiles(id),
  recruiter_id         uuid references public.profiles(id),
  headcount            int not null default 1 check (headcount > 0),
  salary_min           numeric(12,2) check (salary_min is null or salary_min >= 0),
  salary_max           numeric(12,2),
  salary_currency      char(3) not null default 'UAH',
  requirements         text,
  opened_at            date not null default current_date,
  closed_at            date,
  priority             text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status               text not null default 'open'
                       check (status in ('draft', 'open', 'on_hold', 'closed', 'cancelled')),
  pipeline_id          uuid not null references public.pipelines(id),
  custom               jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id) default auth.uid(),
  deleted_at           timestamptz,
  check (salary_max is null or salary_min is null or salary_max >= salary_min),
  check (closed_at is null or closed_at >= opened_at)
);
comment on column public.vacancies.hiring_manager_id is 'Керівник-замовник, якщо він користувач CRM; інакше — лише hiring_manager_name.';
create index ix_vacancies_status    on public.vacancies (status) where deleted_at is null;
create index ix_vacancies_recruiter on public.vacancies (recruiter_id);
create index ix_vacancies_manager   on public.vacancies (hiring_manager_id);
create index ix_vacancies_site      on public.vacancies (site_id);
create trigger trg_vacancies_updated before update on public.vacancies
  for each row execute function app.set_updated_at();

create table public.applications (
  id                   uuid primary key default gen_random_uuid(),
  candidate_id         uuid not null references public.candidates(id) on delete cascade,
  vacancy_id           uuid not null references public.vacancies(id) on delete restrict,
  recruiter_id         uuid references public.profiles(id),
  stage_id             uuid not null references public.pipeline_stages(id),
  source_id            uuid references public.sources(id),
  rejection_reason_id  uuid references public.rejection_reasons(id),
  rejection_comment    text,
  last_contact_at      timestamptz,
  next_action_at       timestamptz,
  next_action_note     text,
  stage_changed_at     timestamptz not null default now(),
  hired_at             timestamptz,
  closed_at            timestamptz,
  custom               jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles(id) default auth.uid(),
  deleted_at           timestamptz,
  unique (candidate_id, vacancy_id)
);
comment on table public.applications is 'Відгук: участь одного кандидата у відборі на одну вакансію. Свій етап, рекрутер, історія.';
create index ix_applications_vacancy_stage on public.applications (vacancy_id, stage_id) where deleted_at is null;
create index ix_applications_recruiter_next on public.applications (recruiter_id, next_action_at) where deleted_at is null;
create index ix_applications_candidate on public.applications (candidate_id);
create trigger trg_applications_updated before update on public.applications
  for each row execute function app.set_updated_at();

create table public.application_stage_history (
  id              bigserial primary key,
  application_id  uuid not null references public.applications(id) on delete cascade,
  from_stage_id   uuid references public.pipeline_stages(id),
  to_stage_id     uuid not null references public.pipeline_stages(id),
  changed_by      uuid references public.profiles(id),
  changed_at      timestamptz not null default now(),
  comment         text
);
create index ix_stage_history_app on public.application_stage_history (application_id, changed_at);
create index ix_stage_history_to  on public.application_stage_history (to_stage_id, changed_at);

-- ---------------------------------------------------------------------
-- Правила етапів: етап з воронки вакансії, дозволені переходи,
-- обов'язкові поля, причина відмови, дати найму/закриття
-- ---------------------------------------------------------------------
create or replace function app.applications_check_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage      public.pipeline_stages%rowtype;
  v_pipeline   uuid;
  v_has_rules  boolean;
  v_rule       public.stage_transitions%rowtype;
  v_field      text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  select * into v_stage from public.pipeline_stages where id = new.stage_id;
  select pipeline_id into v_pipeline from public.vacancies where id = new.vacancy_id;

  if v_stage.pipeline_id is distinct from v_pipeline then
    raise exception 'Етап не належить воронці цієї вакансії' using errcode = 'check_violation';
  end if;
  if not v_stage.is_active then
    raise exception 'Етап «%» вимкнено', v_stage.name using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    select exists (select 1 from public.stage_transitions where from_stage_id = old.stage_id)
      into v_has_rules;
    if v_has_rules then
      select * into v_rule from public.stage_transitions
       where from_stage_id = old.stage_id and to_stage_id = new.stage_id;
      if not found then
        raise exception 'Перехід на етап «%» з поточного етапу заборонено налаштуваннями воронки', v_stage.name
          using errcode = 'check_violation';
      end if;
      foreach v_field in array v_rule.required_fields loop
        if coalesce(to_jsonb(new) ->> v_field, '') = '' then
          raise exception 'Для переходу на етап «%» заповніть поле %', v_stage.name, v_field
            using errcode = 'check_violation';
        end if;
      end loop;
    end if;
  end if;

  if v_stage.kind in ('rejected', 'withdrawn') and new.rejection_reason_id is null then
    raise exception 'Для етапу «%» вкажіть причину відмови', v_stage.name using errcode = 'check_violation';
  end if;

  new.stage_changed_at := now();
  if v_stage.kind = 'hired' then
    new.hired_at := coalesce(new.hired_at, now());
  end if;
  if v_stage.kind in ('hired', 'rejected', 'withdrawn') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

create trigger trg_applications_check_stage
  before insert or update of stage_id on public.applications
  for each row execute function app.applications_check_stage();

create or replace function app.applications_log_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.application_stage_history (application_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid());
  end if;
  return null;
end $$;

create trigger trg_applications_log_stage
  after insert or update of stage_id on public.applications
  for each row execute function app.applications_log_stage();

-- ---------------------------------------------------------------------
create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  application_id  uuid references public.applications(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) default auth.uid(),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_notes_candidate on public.notes (candidate_id, created_at desc);
create trigger trg_notes_updated before update on public.notes
  for each row execute function app.set_updated_at();

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid references public.candidates(id) on delete cascade,
  application_id  uuid references public.applications(id) on delete cascade,
  assignee_id     uuid not null references public.profiles(id),
  title           text not null check (length(trim(title)) > 0),
  description     text,
  due_at          timestamptz,
  status          text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at    timestamptz,
  automation_id   uuid,  -- FK додається в міграції конструктора
  created_by      uuid references public.profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ix_tasks_assignee_due on public.tasks (assignee_id, due_at) where status = 'open';
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function app.set_updated_at();
