-- =====================================================================
-- Підготовка робочого місця IT: довідник «Системні адміністратори» (куди надсилати лист)
-- і заявка на робоче місце для кандидата на етапі «Офер».
-- Обидва — окремо для кожного простору (KAN Talent / HomeHub).
-- =====================================================================
create table public.it_contacts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default app.current_workspace() references public.workspaces(id),
  name          text not null check (length(trim(name)) > 0),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
comment on table public.it_contacts is 'Системні адміністратори: на їхні адреси автоматично йде лист «Підготовка робочого місця».';
create index ix_it_contacts_workspace on public.it_contacts (workspace_id);

create table public.it_requests (
  application_id    uuid primary key references public.applications(id) on delete cascade,
  workspace_id      uuid not null references public.workspaces(id),
  pc_type           text check (pc_type is null or length(pc_type) <= 100),
  company           text check (company is null or length(company) <= 200),
  room              text check (room is null or length(room) <= 200),
  accesses          text check (accesses is null or length(accesses) <= 2000),
  manager           text check (manager is null or length(manager) <= 200),
  updated_by        uuid references public.profiles(id) default auth.uid(),
  updated_at        timestamptz not null default now(),
  sent_at           timestamptz,
  sent_to           text,
  sent_by           uuid references public.profiles(id),
  gmail_message_id  text
);
comment on table public.it_requests is 'Заявка IT на підготовку робочого місця для кандидата (дані листа і коли надіслано).';

-- Простір заявки — як у відгуку
create or replace function app.it_requests_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select workspace_id into new.workspace_id from public.applications where id = new.application_id;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger trg_it_requests_defaults before insert or update on public.it_requests
  for each row execute function app.it_requests_defaults();

-- Хто може змінювати відгук (рекрутер вакансії, керівник вакансії, адміністратор)
create or replace function app.can_update_application(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_id and a.deleted_at is null and app.member_of(a.workspace_id)
      and app.application_in_scope('applications.update', a.recruiter_id, a.vacancy_id))
$$;
revoke execute on function app.can_update_application(uuid) from public, anon;
grant execute on function app.can_update_application(uuid) to authenticated, service_role;

alter table public.it_contacts enable row level security;
alter table public.it_requests enable row level security;
grant select, insert, update on public.it_contacts, public.it_requests to authenticated;
grant all on public.it_contacts, public.it_requests to service_role;

create policy it_contacts_select on public.it_contacts for select to authenticated using (app.is_active_user());
create policy it_contacts_insert on public.it_contacts for insert to authenticated with check (app.has_permission('settings.manage'));
create policy it_contacts_update on public.it_contacts for update to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create policy it_contacts_workspace on public.it_contacts as restrictive for all to authenticated
  using (workspace_id = any ((select app.visible_workspaces())::uuid[])) with check (app.member_of(workspace_id));

create policy it_requests_select on public.it_requests for select to authenticated using (app.can_read_application(application_id));
create policy it_requests_insert on public.it_requests for insert to authenticated with check (app.can_update_application(application_id));
create policy it_requests_update on public.it_requests for update to authenticated
  using (app.can_update_application(application_id)) with check (app.can_update_application(application_id));
create policy it_requests_workspace on public.it_requests as restrictive for all to authenticated
  using (workspace_id = any ((select app.visible_workspaces())::uuid[])) with check (app.member_of(workspace_id));

create trigger trg_it_contacts_audit after insert or update or delete on public.it_contacts
  for each row execute function app.audit_row();
create trigger trg_it_requests_audit after insert or update or delete on public.it_requests
  for each row execute function app.audit_row();
