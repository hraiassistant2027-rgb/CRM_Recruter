-- =====================================================================
-- Етапи з датою: рекрутер, керівник, поліграф, офер (оформлення), працевлаштування.
-- Передача кандидатів кадровикам для оформлення.
-- =====================================================================

-- Нові типи подій: поліграф і вихід на роботу
alter table public.interviews drop constraint if exists interviews_kind_check;
alter table public.interviews add constraint interviews_kind_check
  check (kind in ('call', 'phone', 'manager', 'repeat', 'polygraph', 'offer', 'start', 'other'));
alter table public.pipeline_stages drop constraint if exists pipeline_stages_contact_kind_check;
alter table public.pipeline_stages add constraint pipeline_stages_contact_kind_check
  check (contact_kind is null or contact_kind in ('call', 'phone', 'manager', 'repeat', 'polygraph', 'offer', 'start'));

-- Новий етап «Перевірка на поліграфі» — одразу після співбесіди з керівником
do $$
declare
  v_pipeline uuid;
  v_after int;
begin
  select id into v_pipeline from public.pipelines where is_default;
  if v_pipeline is null or exists (select 1 from public.pipeline_stages where pipeline_id = v_pipeline and code = 'polygraph') then
    return;
  end if;
  select sort_order into v_after from public.pipeline_stages where pipeline_id = v_pipeline and code = 'manager_interview';
  update public.pipeline_stages set sort_order = sort_order + 1 where pipeline_id = v_pipeline and sort_order > v_after;
  insert into public.pipeline_stages (pipeline_id, code, name, color, sort_order, kind, sla_days)
  values (v_pipeline, 'polygraph', 'Перевірка на поліграфі', '#A855F7', v_after + 1, 'open', 5);
end $$;

-- Дата обов'язкова лише для цих етапів
update public.pipeline_stages s set contact_kind = null
from public.pipelines p where s.pipeline_id = p.id and p.is_default;

update public.pipeline_stages s set contact_kind = v.kind, name = coalesce(v.new_name, s.name)
from public.pipelines p, (values
  ('phone_interview',   'phone',     'Співбесіда з рекрутером'),
  ('manager_interview', 'manager',   null),
  ('polygraph',         'polygraph', null),
  ('offer',             'offer',     'Офер'),
  ('hired',             'start',     null)) as v(code, kind, new_name)
where s.pipeline_id = p.id and p.is_default and s.code = v.code;

-- ---------------------------------------------------------------------
-- Кадровики (довідник) і передача кандидатів на оформлення
-- ---------------------------------------------------------------------
create table public.hr_contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.hr_contacts is 'Кадровики, яким рекрутери передають кандидатів на оформлення.';

create table public.hr_handoffs (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.applications(id) on delete cascade,
  hr_contact_id    uuid references public.hr_contacts(id) on delete set null,
  hr_email         text not null,
  subject          text,
  body_text        text,
  gmail_message_id text,
  sent_by          uuid references public.profiles(id) default auth.uid(),
  sent_at          timestamptz not null default now()
);
create index ix_hr_handoffs_app on public.hr_handoffs (application_id, sent_at desc);
comment on table public.hr_handoffs is 'Журнал передачі кандидата кадровику (лист з даними для оформлення).';

alter table public.hr_contacts enable row level security;
alter table public.hr_handoffs enable row level security;

grant select, insert, update on public.hr_contacts to authenticated;
grant select, insert on public.hr_handoffs to authenticated;
grant select, insert, update, delete on public.hr_contacts, public.hr_handoffs to service_role;

create policy hr_contacts_select on public.hr_contacts for select to authenticated using (app.is_active_user());
create policy hr_contacts_insert on public.hr_contacts for insert to authenticated with check (app.has_permission('settings.manage'));
create policy hr_contacts_update on public.hr_contacts for update to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));

create policy hr_handoffs_select on public.hr_handoffs for select to authenticated using (app.can_read_application(application_id));
create policy hr_handoffs_insert on public.hr_handoffs for insert to authenticated
  with check (app.has_permission('email.send') and app.can_read_application(application_id) and sent_by = auth.uid());

create trigger trg_hr_contacts_audit after insert or update or delete on public.hr_contacts
  for each row execute function app.audit_row();
create trigger trg_hr_handoffs_audit after insert or update or delete on public.hr_handoffs
  for each row execute function app.audit_row();
