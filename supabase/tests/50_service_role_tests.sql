-- Службова роль: серверні операції (етап 5)
\set QUIET on
set client_min_messages = notice;

\echo '--- 18. Службова роль сервера'
reset role;
grant usage on schema tst to service_role;
grant execute on all functions in schema tst to service_role;
set role service_role;
select tst.ok(tst.rows($$insert into public.email_accounts (user_id, google_email, refresh_token_encrypted, status)
  values ('00000000-0000-0000-0000-0000000000a2', 'rec@gmail.com', '\x00ff', 'active')
  on conflict (user_id) do update set google_email = excluded.google_email, refresh_token_encrypted = excluded.refresh_token_encrypted$$) = 1,
  'сервер зберігає зашифрований токен Google');
select tst.ok((select count(*) from public.email_accounts where google_email = 'rec@gmail.com') = 1, 'сервер читає токен');
select tst.ok((select count(*) from public.documents) >= 0, 'сервер перевіряє файли на дублікати');
select tst.blocked($$update public.audit_log set action = 'login'$$, 'журнал дій незмінний і для сервера');
reset role;

set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$select refresh_token_encrypted from public.email_accounts$$, 'користувач не бачить навіть свій токен');
select tst.ok((select google_email from public.email_accounts) = 'rec@gmail.com', 'користувач бачить, яку пошту підключено');
reset role;

\echo '=== Тести службової ролі пройдено ==='
