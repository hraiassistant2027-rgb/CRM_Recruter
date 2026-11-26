-- Сайти вакансій: пароль недоступний браузеру, простори розділені
\set QUIET on
set client_min_messages = notice;
\echo '--- 34. Сайти вакансій (robota.ua)'
insert into public.job_board_accounts (workspace_id, label, login, password_encrypted)
  values ('a1000000-0000-0000-0000-000000000001', 'KAN основний', 'hr@kan.test', '\x01'::bytea),
         ('a1000000-0000-0000-0000-000000000002', 'HomeHub', 'hr@homehub.test', '\x02'::bytea);
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.ok((select count(*) from public.job_board_accounts) = 1, 'адміністратор бачить кабінети лише свого простору');
select tst.blocked($$select password_encrypted from public.job_board_accounts$$, 'пароль браузеру недоступний');
select tst.blocked($$select token_encrypted from public.job_board_accounts$$, 'токен браузеру недоступний');
select tst.blocked($$insert into public.job_board_accounts (label, login, password_encrypted) values ('x', 'x@x.test', '\x00')$$, 'додати кабінет можна лише через сервер');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.job_board_accounts) = 0, 'рекрутер не бачить кабінети роботодавця');
select set_config('request.headers', '', false);
reset role;
delete from public.job_board_accounts;
\echo '=== Тести сайтів вакансій пройдено ==='
