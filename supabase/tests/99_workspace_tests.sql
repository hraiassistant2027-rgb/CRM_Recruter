-- Простори KAN Talent / HomeHub
\set QUIET on
set client_min_messages = notice;
\echo '--- 30. Простори KAN Talent і HomeHub'

-- Дані HomeHub (як служба, без користувача)
insert into public.candidates (id, workspace_id, full_name, phone, city)
values ('99000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'Мельник Ольга', '+380671234567', 'Київ');
insert into public.vacancies (id, workspace_id, title, pipeline_id)
select '99000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Сантехнік', p.id
from public.pipelines p where p.is_default;

set role authenticated;
-- Рекрутер KAN
select tst.login('00000000-0000-0000-0000-0000000000a2');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.ok((select count(*) from public.my_workspaces()) = 1, 'рекрутеру KAN доступний лише один простір');
select tst.ok(not exists (select 1 from public.candidates where id = '99000000-0000-0000-0000-000000000001'), 'рекрутер KAN не бачить кандидатів HomeHub');
select set_config('request.headers', '{"x-workspace":"homehub"}', false);
select tst.ok(not exists (select 1 from public.candidates where id = '99000000-0000-0000-0000-000000000001'), '…навіть якщо підмінить заголовок простору');
select tst.ok((select count(*) from public.candidates) = 0, 'чужий простір — порожньо');
select tst.blocked($$insert into public.notes (candidate_id, body) values ('99000000-0000-0000-0000-000000000001', 'х')$$,
                   'нотатку в картку HomeHub не додати');
select tst.blocked($$insert into public.candidates (workspace_id, full_name) values ('a1000000-0000-0000-0000-000000000002', 'Підкинутий Кандидат')$$,
                   'кандидата в HomeHub не створити');

-- Супер адміністратор бачить обидва простори, але кожен окремо
select tst.login('00000000-0000-0000-0000-0000000000a1');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.ok((select count(*) from public.my_workspaces()) = 2, 'адміністратору доступні обидва простори');
select tst.ok(not exists (select 1 from public.candidates where id = '99000000-0000-0000-0000-000000000001'), 'у KAN не видно кандидатів HomeHub');
select tst.ok(not exists (select 1 from public.vacancies where id = '99000000-0000-0000-0000-000000000002'), 'у KAN не видно вакансій HomeHub');
select set_config('request.headers', '{"x-workspace":"homehub"}', false);
select tst.ok((select count(*) from public.candidates) = 1, 'у HomeHub — лише його кандидати');
select tst.ok((select id from public.my_workspaces() where is_current) = 'a1000000-0000-0000-0000-000000000002', 'поточний простір — HomeHub');
select tst.ok(tst.rows($$insert into public.candidates (id, full_name, phone) values ('99000000-0000-0000-0000-000000000003', 'Іваненко Петро', '+380671234567')$$) = 1,
              'той самий телефон може бути в обох базах');
select tst.ok((select workspace_id from public.candidates where id = '99000000-0000-0000-0000-000000000003') = 'a1000000-0000-0000-0000-000000000002',
              'новий кандидат записався в поточний простір');
select tst.ok(not exists (select 1 from public.find_candidate_duplicates('+380671234567') d
                          where d.candidate_id = '30000000-0000-0000-0000-000000000001'), 'дублікати шукаються лише в поточній базі');
select tst.ok(tst.rows($$insert into public.legal_entities (name) values ('ТОВ Тест')$$) = 1, 'юрособа з такою ж назвою, як у KAN — дозволено');
select tst.blocked($$insert into public.applications (candidate_id, vacancy_id, stage_id)
  select '30000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000002', s.id
  from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default order by s.sort_order limit 1$$,
                   'кандидата KAN не додати у вакансію HomeHub');
select tst.blocked($$update public.candidates set workspace_id = 'a1000000-0000-0000-0000-000000000001' where id = '99000000-0000-0000-0000-000000000003'$$,
                   'кандидата не перенести в інший простір');
select set_config('request.headers', '{"x-workspace":"kan,homehub"}', false);
select tst.ok((select count(*) from public.candidates where phone_e164 = '+380671234567') = 3, 'пошук в обох базах одночасно');
select set_config('request.headers', '', false);
reset role;
\echo '=== Тести просторів пройдено ==='
