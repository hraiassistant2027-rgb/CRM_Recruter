-- Підготовка робочого місця IT
\set QUIET on
set client_min_messages = notice;
\echo '--- 32. Підготовка робочого місця IT'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.ok(tst.rows($$insert into public.it_contacts (name, email) values ('Сисадмін KAN', 'it@kan.test')$$) = 1, 'адміністратор додає системного адміністратора');
select tst.ok(tst.rows($$insert into public.it_requests (application_id, pc_type, room, manager)
  select id, 'Ноутбук', 'каб. 204', 'Петренко І.' from public.applications order by created_at limit 1$$) = 1, 'заявка IT зберігається');
select tst.ok((select workspace_id from public.it_requests limit 1) = 'a1000000-0000-0000-0000-000000000001', 'заявка — у просторі відгуку');
select set_config('request.headers', '{"x-workspace":"homehub"}', false);
select tst.ok(not exists (select 1 from public.it_contacts where email = 'it@kan.test'), 'у HomeHub — свої системні адміністратори');
select tst.ok(not exists (select 1 from public.it_requests), 'у HomeHub не видно заявок KAN');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.blocked($$insert into public.it_contacts (name, email) values ('Х', 'x@x.test')$$, 'рекрутер не змінює довідник IT');
select set_config('request.headers', '', false);
reset role;
\echo '=== Тести IT пройдено ==='
