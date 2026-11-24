-- =====================================================================
-- Банк резюме: пошук по архіву на Google Диску
-- =====================================================================
-- Файли архіву залишаються на Google Диску. CRM зберігає лише налаштування (папка архіву,
-- список її підпапок для пошуку) і позначку, який файл Диска вже додано в базу кандидатів.

create table public.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_.]{1,62}$'),
  value       jsonb not null,
  updated_by  uuid references public.profiles(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);
comment on table public.app_settings is 'Загальні налаштування CRM (наприклад, папка архіву резюме на Google Диску).';
alter table public.app_settings enable row level security;
grant select, insert, update on public.app_settings to authenticated;
grant select, insert, update, delete on public.app_settings to service_role;
create policy app_settings_select on public.app_settings for select to authenticated using (app.is_active_user());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (app.has_permission('settings.manage'));
create policy app_settings_update on public.app_settings for update to authenticated
  using (app.has_permission('settings.manage')) with check (app.has_permission('settings.manage'));
create trigger trg_app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function app.audit_row();

-- Звідки файл резюме (наприклад, drive:<id файлу>) — щоб у банку бачити, що вже додано в базу
alter table public.documents add column if not exists source_ref text;
create index if not exists ix_documents_source_ref on public.documents (source_ref) where source_ref is not null;

-- Пункт меню «Банк резюме» одразу після бази кандидатів
update public.menu_items set sort_order = sort_order + 1 where target_type = 'system' and sort_order >= 3;
insert into public.menu_items (name, icon, sort_order, target_type, target_ref, required_permission, admin_only)
select 'Банк резюме', 'archive', 3, 'system', 'resume_bank', 'candidates.read', false
where not exists (select 1 from public.menu_items where target_ref = 'resume_bank');
