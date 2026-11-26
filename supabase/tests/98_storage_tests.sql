-- Запуск у роботу: використання сховища
\set QUIET on
set client_min_messages = notice;
\echo '--- 29. Сховище файлів'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok((public.storage_usage() ->> 'bytes')::bigint >= 0, 'адміністратор бачить, скільки місця зайнято');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$select public.storage_usage()$$, 'рекрутер — ні');
reset role;
\echo '=== Тести сховища пройдено ==='
