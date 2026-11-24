-- =====================================================================
-- Права службової ролі (service_role) — серверна частина CRM
-- =====================================================================
-- Нові проєкти Supabase не видають таблицям прав автоматично. Службова роль
-- використовується лише на сервері (секретний ключ ніколи не потрапляє в браузер)
-- для дій, недоступних користувачам: збереження зашифрованих токенів Google,
-- запис вхідних листів, відкат невдалого завантаження файлу, перевірка дублікатів файлів.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Журнал дій лишається незмінним і для службової ролі
revoke update, delete on public.audit_log from service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
