-- =====================================================================
-- Звіт по вакансіях: юрособи, проєкти, клас складності, тип заявки, планові строки
-- =====================================================================
create table public.legal_entities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  color       text not null default '#93C5FD' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
comment on table public.legal_entities is 'Юридичні особи компанії (колір — позначка у звіті по вакансіях).';

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
comment on table public.projects is 'Проєкти компанії (колонка «Проект» у звіті по вакансіях).';

insert into public.projects (name, sort_order) values
  ('Клев', 1), ('дев', 2), ('ритм', 3), ('фт', 4), ('буд', 5), ('респ', 6), ('експ.', 7), ('прод', 8)
on conflict (name) do nothing;

alter table public.vacancies
  add column if not exists legal_entity_id uuid references public.legal_entities(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists work_place text check (work_place in ('office', 'site', 'remote')),
  add column if not exists request_type text check (request_type in ('new', 'replacement', 'expansion', 'maternity')),
  add column if not exists difficulty_class text check (difficulty_class in ('A', 'B', 'C', 'D')),
  add column if not exists planned_close_days int check (planned_close_days between 1 and 730),
  add column if not exists request_adjusted_at date,
  add column if not exists report_note text check (report_note is null or length(report_note) <= 500);

comment on column public.vacancies.difficulty_class is 'Клас вакансії: A легка (30 дн), B середня (45), C складна (90), D критична (180).';

alter table public.legal_entities enable row level security;
alter table public.projects enable row level security;
grant select, insert, update on public.legal_entities, public.projects to authenticated;
grant select, insert, update, delete on public.legal_entities, public.projects to service_role;
create policy legal_entities_select on public.legal_entities for select to authenticated using (app.is_active_user());
create policy legal_entities_insert on public.legal_entities for insert to authenticated with check (app.has_permission('settings.manage'));
create policy legal_entities_update on public.legal_entities for update to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy projects_select on public.projects for select to authenticated using (app.is_active_user());
create policy projects_insert on public.projects for insert to authenticated with check (app.has_permission('settings.manage'));
create policy projects_update on public.projects for update to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create trigger trg_legal_entities_audit after insert or update or delete on public.legal_entities for each row execute function app.audit_row();
create trigger trg_projects_audit after insert or update or delete on public.projects for each row execute function app.audit_row();
