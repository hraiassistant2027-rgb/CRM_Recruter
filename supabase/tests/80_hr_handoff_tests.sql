-- Етапи з датою і передача кадровикам
\set QUIET on
set client_min_messages = notice;

\echo '--- 21. Етапи з датою'
reset role;
select tst.ok((select array_agg(code order by sort_order) from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default
               where contact_kind is not null) = array['phone_interview', 'manager_interview', 'polygraph', 'offer', 'hired'],
              'дату вимагають лише: рекрутер, керівник, поліграф, офер, працевлаштування');
select tst.ok((select s.name from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'phone_interview')
              = 'Співбесіда з рекрутером', 'етап перейменовано на «Співбесіда з рекрутером»');
select tst.ok((select count(*) from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default) = 14,
              'у воронці 14 етапів (додано поліграф), порядок без дублів');

\echo '--- 22. Передача кадровикам'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$insert into public.hr_contacts (id, name, email) values ('81000000-0000-0000-0000-000000000001', 'Кадровик Тест', 'hr.test@kan.ua')$$) = 1,
              'адміністратор додає кадровика');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$insert into public.hr_contacts (name, email) values ('Х', 'x@kan.ua')$$, 'рекрутер не змінює список кадровиків');
select tst.ok((select count(*) from public.hr_contacts) >= 1, 'рекрутер бачить список кадровиків');
select tst.ok(tst.rows($$insert into public.hr_handoffs (application_id, hr_contact_id, hr_email, subject)
  values ('43000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'hr.test@kan.ua', 'Оформлення')$$) = 1,
  'рекрутер фіксує передачу кандидата кадровику');
select tst.login('00000000-0000-0000-0000-0000000000a8');
select tst.blocked($$insert into public.hr_handoffs (application_id, hr_email) values ('43000000-0000-0000-0000-000000000001', 'hr.test@kan.ua')$$,
                   'керівник-замовник не надсилає кадровикам');
reset role;
\echo '=== Тести кадровиків пройдено ==='

\echo '--- 23. Статуси оформлення'
reset role;
select tst.ok((select count(*) from public.hr_contacts where email = 'a.v.usataya@gmail.com') = 3, 'три кадровики зі спільною скринькою');
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok(tst.rows($$update public.applications set hr_docs_status = 'passed', hr_approval_status = 'signed'
  where id = '43000000-0000-0000-0000-000000000001'$$) = 1, 'рекрутер позначає статуси документів і листа погодження');
select tst.blocked($$update public.applications set hr_docs_status = 'maybe' where id = '43000000-0000-0000-0000-000000000001'$$,
                   'невідомий статус не приймається');
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$update public.hr_contacts set email = 'liza@kan.ua' where name = 'Ліза'$$) = 1, 'адміністратор змінює email кадровика');
reset role;
\echo '=== Тести статусів оформлення пройдено ==='

\echo '--- 24. Банк резюме: налаштування'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$insert into public.app_settings (key, value) values ('resume_bank', '{"folderId": "x"}')$$) = 1,
              'адміністратор підключає папку архіву');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select value ->> 'folderId' from public.app_settings where key = 'resume_bank') = 'x', 'рекрутер бачить налаштування банку');
select tst.ok(tst.rows($$update public.app_settings set value = '{}' where key = 'resume_bank'$$) = 0, 'рекрутер не змінює налаштування банку');
reset role;
select tst.ok((select count(*) from public.menu_items where target_ref = 'resume_bank') = 1, 'пункт меню «Банк резюме» додано');
\echo '=== Тести банку резюме пройдено ==='
