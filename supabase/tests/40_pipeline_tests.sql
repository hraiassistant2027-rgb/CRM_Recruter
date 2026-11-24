-- Тести вакансій і воронки (етап 4)
\set QUIET on
set client_min_messages = notice;

reset role;
-- Правила переходів з попередніх тестів тут не потрібні: за замовчуванням будь-який перехід дозволено
delete from public.stage_transitions;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a8', 'manager3@kan.test', '{"full_name": "Керівник Три"}');
insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a8', id from public.roles where code = 'hiring_manager';

insert into public.vacancies (id, title, recruiter_id, hiring_manager_id, pipeline_id)
select '41000000-0000-0000-0000-000000000001', 'Прораб (тест 4)', '00000000-0000-0000-0000-0000000000a2',
       '00000000-0000-0000-0000-0000000000a8', id from public.pipelines where is_default;
insert into public.vacancies (id, title, recruiter_id, pipeline_id)
select '41000000-0000-0000-0000-000000000002', 'Кошторисник (тест 4)', '00000000-0000-0000-0000-0000000000a3', id
from public.pipelines where is_default;
insert into public.candidates (id, full_name, owner_id) values
  ('42000000-0000-0000-0000-000000000001', 'Воронка Тест Перший', '00000000-0000-0000-0000-0000000000a2');
set role authenticated;

\echo '--- 14. Вакансії і відгуки'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok(tst.rows($$insert into public.applications (id, candidate_id, vacancy_id, recruiter_id, stage_id)
  select '43000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
         '41000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', s.id
  from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'new'$$) = 1,
  'рекрутер додає кандидата у свою вакансію');
select tst.blocked($$insert into public.applications (candidate_id, vacancy_id, recruiter_id, stage_id)
  select '42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
         '00000000-0000-0000-0000-0000000000a2', s.id
  from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'new'$$,
  'той самий кандидат удруге в ту ж вакансію не додається');
select tst.ok((select sum(cnt) from public.vacancy_stage_counts() where vacancy_id = '41000000-0000-0000-0000-000000000001') = 1,
              'лічильник кандидатів по вакансії');

\echo '--- 15. Переміщення по етапах'
select public.move_application('43000000-0000-0000-0000-000000000001',
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'phone_interview'),
  null, 'Домовились на завтра');
select tst.ok((select s.code from public.applications a join public.pipeline_stages s on s.id = a.stage_id
               where a.id = '43000000-0000-0000-0000-000000000001') = 'phone_interview', 'кандидата переміщено на інший етап');
select tst.ok((select comment from public.application_stage_history where application_id = '43000000-0000-0000-0000-000000000001'
               order by id desc limit 1) = 'Домовились на завтра', 'коментар збережено в історії переходу');
select tst.ok((select count(*) from public.application_stage_history where application_id = '43000000-0000-0000-0000-000000000001') = 2,
              'історія: додавання + перехід');
select tst.blocked($$select public.move_application('43000000-0000-0000-0000-000000000001',
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'rejected'))$$,
  'відмова без причини не приймається');
select public.move_application('43000000-0000-0000-0000-000000000001',
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'rejected'),
  (select id from public.rejection_reasons where name = 'Не відповідає вимогам'), 'Немає досвіду монолітних робіт');
select tst.ok((select closed_at is not null and rejection_comment = 'Немає досвіду монолітних робіт'
               from public.applications where id = '43000000-0000-0000-0000-000000000001'), 'відмова з причиною закриває відгук');
select public.move_application('43000000-0000-0000-0000-000000000001',
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'first_contact'));
select tst.ok((select closed_at is null and rejection_reason_id is null from public.applications
               where id = '43000000-0000-0000-0000-000000000001'), 'повернення з відмови знімає причину і відкриває відгук');

\echo '--- 16. Права керівника-замовника'
select tst.login('00000000-0000-0000-0000-0000000000a8');
select tst.ok((select count(*) from public.vacancies where title like '%(тест 4)') = 1, 'керівник бачить лише свою вакансію');
select tst.ok((select count(*) from public.applications where id = '43000000-0000-0000-0000-000000000001') = 1,
              'керівник бачить кандидатів своєї вакансії');
select tst.ok((select count(*) from public.candidates where id = '42000000-0000-0000-0000-000000000001') = 1,
              'керівник бачить картку кандидата своєї вакансії');
select tst.blocked($$select public.move_application('43000000-0000-0000-0000-000000000001',
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'offer'))$$,
  'керівник не може переміщати кандидатів');

\echo '--- 17. Чужа вакансія рекрутера'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok(tst.rows($$update public.vacancies set headcount = 3 where id = '41000000-0000-0000-0000-000000000002'$$) = 0,
              'рекрутер не редагує вакансію іншого рекрутера');
select tst.ok(tst.rows($$update public.vacancies set headcount = 2 where id = '41000000-0000-0000-0000-000000000001'$$) = 1,
              'рекрутер редагує свою вакансію');
reset role;

\echo '=== Тести воронки пройдено ==='
