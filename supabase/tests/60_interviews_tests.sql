-- Тести співбесід (етап 6)
\set QUIET on
set client_min_messages = notice;

\echo '--- 19. Співбесіди'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok(tst.rows($$insert into public.interviews (id, application_id, kind, starts_at, ends_at, location)
  values ('61000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 'phone',
          now() + interval '1 day', now() + interval '1 day 30 minutes', 'Телефоном')$$) = 1,
  'рекрутер призначає співбесіду у своїй вакансії');
select tst.ok(tst.rows($$insert into public.interview_participants (interview_id, email, display_name)
  values ('61000000-0000-0000-0000-000000000001', 'cand@mail.com', 'Кандидат')$$) = 1, 'учасник співбесіди додається');
select tst.blocked($$insert into public.interviews (application_id, kind, starts_at, ends_at)
  values ('43000000-0000-0000-0000-000000000002', 'phone', now() + interval '1 day', now() + interval '1 day 30 minutes')$$,
  'рекрутер не призначає співбесіди в чужій вакансії');
select tst.blocked($$insert into public.interviews (application_id, kind, starts_at, ends_at)
  values ('43000000-0000-0000-0000-000000000001', 'phone', now() + interval '2 day', now() + interval '1 day')$$,
  'кінець співбесіди не може бути раніше початку');
select tst.ok(tst.rows($$update public.interviews set status = 'done', result = 'Рекомендовано', result_comment = 'Сильний досвід'
  where id = '61000000-0000-0000-0000-000000000001'$$) = 1, 'результат співбесіди зберігається');

select tst.login('00000000-0000-0000-0000-0000000000a8');
select tst.ok((select count(*) from public.interviews where id = '61000000-0000-0000-0000-000000000001') = 1,
              'керівник-замовник бачить співбесіди своєї вакансії');
select tst.ok(tst.rows($$update public.interviews set result = 'x' where id = '61000000-0000-0000-0000-000000000001'$$) = 0,
              'керівник-замовник не змінює співбесіди');
reset role;

\echo '=== Тести співбесід пройдено ==='
