-- Звіт по вакансіях: довідники і поля вакансії
\set QUIET on
set client_min_messages = notice;

\echo '--- 26. Звіт по вакансіях'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$insert into public.legal_entities (id, name, color) values ('91000000-0000-0000-0000-000000000001', 'ТОВ Тест', '#93C5FD')$$) = 1,
              'адміністратор додає юрособу з кольором');
select tst.ok((select count(*) from public.projects) >= 8, 'проєкти зі звіту додано');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$insert into public.projects (name) values ('новий')$$, 'рекрутер не змінює довідник проєктів');
select tst.ok(tst.rows($$update public.vacancies set legal_entity_id = '91000000-0000-0000-0000-000000000001', difficulty_class = 'C',
  planned_close_days = 90, request_type = 'replacement', work_place = 'site'
  where id = '41000000-0000-0000-0000-000000000001'$$) = 1, 'рекрутер заповнює поля звіту у своїй вакансії');
select tst.blocked($$update public.vacancies set difficulty_class = 'E' where id = '41000000-0000-0000-0000-000000000001'$$,
                   'невідомий клас вакансії не приймається');
reset role;
\echo '=== Тести звіту пройдено ==='
