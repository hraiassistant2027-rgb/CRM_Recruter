-- Тести пошуку кандидатів і перевірки дублікатів (етап 3)
\set QUIET on
set client_min_messages = notice;

reset role;
-- Окремий керівник-замовник без жодних вакансій (a4 у попередніх тестах отримав роль адміністратора)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a7', 'manager2@kan.test', '{"full_name": "Керівник Два"}');
insert into public.user_roles (user_id, role_id)
select '00000000-0000-0000-0000-0000000000a7', id from public.roles where code = 'hiring_manager';
insert into public.candidates (id, full_name, phone, email, city, owner_id, skills, current_position) values
  ('31000000-0000-0000-0000-000000000001', 'Бондаренко Олег', '+380931112233', 'oleg.b@mail.com', 'Дніпро',
   '00000000-0000-0000-0000-0000000000a2', array['Revit', 'BIM'], 'Інженер-конструктор'),
  ('31000000-0000-0000-0000-000000000002', 'Мельник Ігор', null, null, 'Дніпро',
   '00000000-0000-0000-0000-0000000000a3', '{}', 'Монолітник');
insert into public.candidates (id, full_name, city, owner_id, deleted_at) values
  ('31000000-0000-0000-0000-000000000003', 'Видалений Кандидат', 'Дніпро', '00000000-0000-0000-0000-0000000000a2', now());
insert into public.documents (candidate_id, storage_path, original_name, sha256, extracted_text, uploaded_by)
values ('31000000-0000-0000-0000-000000000002', 'test/melnyk.pdf', 'melnyk.pdf', repeat('a', 64),
        'Досвід: опалубка, армування, бетонні роботи', '00000000-0000-0000-0000-0000000000a3');
set role authenticated;

\echo '--- 11. Пошук кандидатів'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.search_candidates('бондар')) = 1, 'пошук за початком прізвища');
select tst.ok((select matched_in from public.search_candidates('бондар')) = 'profile', 'видно, де знайдено збіг (профіль)');
select tst.ok((select count(*) from public.search_candidates('revit')) = 1, 'пошук за навичкою');
select tst.ok((select count(*) from public.search_candidates('інженер конструкт')) = 1, 'пошук за кількома словами посади');
select tst.ok((select matched_in from public.search_candidates('093 111 22 33')) = 'phone', 'пошук за телефоном у будь-якому форматі');
select tst.ok((select count(*) from public.search_candidates('OLEG.B@mail.com')) = 1, 'пошук за email без урахування регістру');
select tst.ok((select matched_in from public.search_candidates('опалуб')) = 'resume', 'пошук за текстом резюме');
select tst.ok((select count(*) from public.search_candidates(null, 'дніпро')) = 2, 'фільтр за містом (без видалених)');
select tst.ok((select count(*) from public.search_candidates(null, 'Дніпро', null, '00000000-0000-0000-0000-0000000000a2')) = 1,
              'фільтр «мої кандидати»');
select tst.ok((select max(total_count) from public.search_candidates(null, 'Дніпро', null, null, null, false, 1, 0)) = 2,
              'загальна кількість для сторінок рахується правильно');
select tst.ok((select count(*) from public.search_candidates(null, 'Дніпро', null, null, null, true)) = 0,
              'рекрутер не бачить кошик');
select tst.ok((select count(*) from public.search_candidates('видалений')) = 0, 'видалені не знаходяться звичайним пошуком');
select tst.ok((select count(*) from public.search_candidates('%'' or 1=1 --')) = 0, 'спецсимволи в запиті безпечні');

select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok((select count(*) from public.search_candidates(null, 'Дніпро', null, null, null, true)) = 1,
              'SUPER ADMIN бачить кошик');

select tst.login('00000000-0000-0000-0000-0000000000a7');
select tst.ok((select count(*) from public.search_candidates('бондар')) = 0, 'керівник не знаходить чужих кандидатів');

\echo '--- 12. Дублікати'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select accessible and full_name = 'Бондаренко Олег' from public.describe_duplicates('0931112233')),
              'дублікат за телефоном знайдено, ім''я видно рекрутеру');
select tst.ok((select count(*) from public.describe_duplicates('0931112233', null, null, null, null,
                                                               '31000000-0000-0000-0000-000000000001')) = 0,
              'під час редагування картка не вважається дублікатом сама себе');
select tst.ok((select matched_on from public.describe_duplicates(null, null, null, 'Мельник Iгор')) = 'name',
              'ймовірний дублікат за ПІБ');

select tst.login('00000000-0000-0000-0000-0000000000a7');
select tst.ok((select not accessible and full_name is null from public.describe_duplicates('0931112233')),
              'керівник бачить лише факт дубліката, без даних кандидата');
reset role;

\echo '=== Тести кандидатів пройдено ==='
