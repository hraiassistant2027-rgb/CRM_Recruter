-- Супер адміністратор: видалення користувачів і ролей
\set QUIET on
set client_min_messages = notice;
\echo '--- 33. Видалення користувачів і ролей'
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', 'leaver@kan.test', '{"full_name": "Колишній Рекрутер"}');
insert into public.user_roles (user_id, role_id) select '00000000-0000-0000-0000-0000000000a9', id from public.roles where code = 'recruiter';
insert into public.candidates (id, full_name, owner_id, created_by)
values ('99d00000-0000-0000-0000-000000000001', 'Кандидат Колишнього', '00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a9');
insert into public.notes (candidate_id, body, author_id)
values ('99d00000-0000-0000-0000-000000000001', 'Нотатка колишнього', '00000000-0000-0000-0000-0000000000a9');

set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a2', 'aal2');
select tst.blocked($$select public.admin_delete_user('00000000-0000-0000-0000-0000000000a9')$$, 'рекрутер не видаляє користувачів');
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.blocked($$select public.admin_delete_user('00000000-0000-0000-0000-0000000000a9')$$, 'без коду підтвердження — не можна');
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.blocked($$select public.admin_delete_user('00000000-0000-0000-0000-0000000000a1')$$, 'себе видалити не можна');
select public.admin_delete_user('00000000-0000-0000-0000-0000000000a9');
reset role;
select tst.ok(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a9'), 'Супер адміністратор видалив користувача');
select tst.ok(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a9'), 'обліковий запис видалено');
select tst.ok((select owner_id from public.candidates where id = '99d00000-0000-0000-0000-000000000001') is null, 'кандидат залишився, відповідального очищено');
select tst.ok((select author_id from public.notes where candidate_id = '99d00000-0000-0000-0000-000000000001') = '00000000-0000-0000-0000-0000000000a1',
              'нотатка залишилась, автором став Супер адміністратор');
select tst.ok(exists (select 1 from public.audit_log where entity = 'user' and entity_id = '00000000-0000-0000-0000-0000000000a9'), 'видалення записано в журнал');

-- Ролі
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.blocked($$delete from public.roles where code = 'admin'$$, 'роль «Адміністратор» не видалити');
select tst.blocked($$delete from public.roles where code = 'super_admin'$$, 'роль «Супер адміністратор» не видалити');
select tst.login('00000000-0000-0000-0000-0000000000a4', 'aal2');
do $$ begin
  begin
    delete from public.roles where code = 'hiring_manager';
  exception when others then null;
  end;
end $$;
select tst.ok((select count(*) from public.roles where code = 'hiring_manager') = 1, 'адміністратор не видаляє системні ролі');
reset role;
\echo '=== Тести видалення пройдено ==='
