-- Тести функцій для інтерфейсу (виконуються після 10_access_tests.sql на тих самих даних)
\set QUIET on
set client_min_messages = notice;

reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-0000000000a1', 'verified');
set role authenticated;

\echo '--- 10. Функції для інтерфейсу'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.my_permissions() where permission_code = 'candidates.read' and scope = 'all') = 1,
              'рекрутер отримує свої дозволи для меню');
select tst.ok((select count(*) from public.my_permissions() where permission_code = 'roles.manage') = 0,
              'у рекрутера немає керування ролями');
select tst.ok(public.check_permission('candidates.create'), 'check_permission: право є');
select tst.ok(not public.check_permission('users.manage'), 'check_permission: права немає');
select tst.blocked($$select * from public.admin_list_users()$$, 'рекрутер не бачить список користувачів адмін-панелі');

select tst.login('00000000-0000-0000-0000-0000000000a6');
select tst.ok((select count(*) from public.my_permissions()) = 0, 'заблокований користувач не має дозволів');

select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select tst.ok(not public.check_permission('users.manage', true), 'адмін-дія без MFA заборонена');
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.ok(public.check_permission('users.manage', true), 'адмін-дія з MFA дозволена');
select tst.ok((select count(*) from public.admin_list_users()) = 6, 'SUPER ADMIN бачить усіх 6 користувачів');
select tst.ok((select has_mfa from public.admin_list_users() where email = 'super@kan.test'), 'видно, що в адміна налаштовано MFA');
select tst.ok((select 'super_admin' = any(role_codes) from public.admin_list_users() where email = 'super@kan.test'),
              'видно ролі користувача');

reset role;
grant usage on schema tst to anon;
set role anon;
select tst.blocked($$select * from public.my_permissions()$$, 'анонімний доступ до функцій заборонено');
reset role;

\echo '=== Тести функцій інтерфейсу пройдено ==='
