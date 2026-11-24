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
