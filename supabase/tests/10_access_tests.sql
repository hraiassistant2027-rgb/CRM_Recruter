-- =====================================================================
-- Тести прав доступу, аудиту, етапів воронки, дублікатів і конструктора.
-- Кожна перевірка або друкує "OK: ...", або зупиняє виконання з "ПРОВАЛ: ...".
-- =====================================================================
\set QUIET on
set client_min_messages = notice;

create schema tst;
grant usage on schema tst to authenticated;

create function tst.login(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'aal', p_aal, 'role', 'authenticated')::text, false);
end $$;

create function tst.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'ПРОВАЛ: %', p_msg;
  end if;
  raise notice 'OK: %', p_msg;
end $$;

create function tst.blocked(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ПРОВАЛ (дію не заблоковано): %', p_msg;
exception when others then
  if sqlerrm like 'ПРОВАЛ%' then raise; end if;
  raise notice 'OK (заблоковано): % — %', p_msg, sqlerrm;
end $$;

create function tst.rows(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Підготовка даних (від імені власника БД)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'super@kan.test',    '{"full_name": "Старший рекрутер"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'rec1@kan.test',     '{"full_name": "Рекрутер Один"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'rec2@kan.test',     '{"full_name": "Рекрутер Два"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'manager@kan.test',  '{"full_name": "Керівник Об''єкта"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'norole@kan.test',   '{}'),
  ('00000000-0000-0000-0000-0000000000a6', 'inactive@kan.test', '{"full_name": "Звільнений"}');

select app.bootstrap_super_admin('super@kan.test');
insert into public.user_roles (user_id, role_id)
select u.id, r.id from (values
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'recruiter'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'recruiter'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'hiring_manager'),
  ('00000000-0000-0000-0000-0000000000a6'::uuid, 'recruiter')
) u(id, code) join public.roles r on r.code = u.code;
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a6';

insert into public.sites (id, name, region) values
  ('10000000-0000-0000-0000-000000000001', 'ЖК «Тестовий»', 'Київ');

insert into public.vacancies (id, title, site_id, recruiter_id, hiring_manager_id, pipeline_id)
select '20000000-0000-0000-0000-000000000001', 'Виконроб', '10000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a4', p.id
from public.pipelines p where p.is_default;
insert into public.vacancies (id, title, recruiter_id, pipeline_id)
select '20000000-0000-0000-0000-000000000002', 'Інженер ПТВ', '00000000-0000-0000-0000-0000000000a3', p.id
from public.pipelines p where p.is_default;

insert into public.candidates (id, full_name, phone, email, city, owner_id, skills) values
  ('30000000-0000-0000-0000-000000000001', 'Іваненко Петро Олексійович', '+380671234567', 'Petro@Mail.com', 'Київ',
   '00000000-0000-0000-0000-0000000000a2', array['AutoCAD', 'кошторис']),
  ('30000000-0000-0000-0000-000000000002', 'Шевченко Тарас', '050 111 22 33', null, 'Львів',
   '00000000-0000-0000-0000-0000000000a3', '{}'),
  ('30000000-0000-0000-0000-000000000003', 'Коваленко Марія', null, 'maria@mail.com', 'Київ',
   '00000000-0000-0000-0000-0000000000a3', '{}');

insert into public.applications (id, candidate_id, vacancy_id, recruiter_id, stage_id)
select v.app_id, v.cand, v.vac, v.rec, s.id
from (values
  ('40000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3')
) v(app_id, cand, vac, rec)
join public.pipeline_stages s on s.code = 'new';

insert into public.email_accounts (user_id, google_email, refresh_token_encrypted)
values ('00000000-0000-0000-0000-0000000000a2', 'rec1.kan@gmail.com', '\xdeadbeef');

-- ---------------------------------------------------------------------
\echo '--- 1. Нормалізація даних'
select tst.ok(app.normalize_phone('067 123 45 67') = '+380671234567', 'телефон 067... → +380671234567');
select tst.ok(app.normalize_phone('+38 (050) 111-22-33') = '+380501112233', 'телефон +38 (050)... → E.164');
select tst.ok(app.normalize_linkedin('https://ua.linkedin.com/in/petro-ivanenko/?trk=x') = 'linkedin.com/in/petro-ivanenko', 'LinkedIn нормалізується');
select tst.ok((select phone_e164 from public.candidates where id = '30000000-0000-0000-0000-000000000002') = '+380501112233', 'phone_e164 обчислюється автоматично');

-- ---------------------------------------------------------------------
\echo '--- 2. Видимість даних за ролями'
set role authenticated;

select tst.login('00000000-0000-0000-0000-0000000000a5');
select tst.ok((select count(*) from public.candidates) = 0, 'користувач без ролі не бачить кандидатів');
select tst.ok((select count(*) from public.vacancies) = 0, 'користувач без ролі не бачить вакансій');

select tst.login('00000000-0000-0000-0000-0000000000a6');
select tst.ok((select count(*) from public.candidates) = 0, 'заблокований рекрутер не бачить нічого');

select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.candidates) = 3, 'рекрутер бачить усю спільну базу (3 кандидати)');
select tst.ok((select count(*) from public.applications) = 4, 'рекрутер бачить усі відгуки (4)');

select tst.login('00000000-0000-0000-0000-0000000000a4');
select tst.ok((select count(*) from public.vacancies) = 1, 'керівник бачить лише свою вакансію');
select tst.ok((select count(*) from public.candidates) = 2, 'керівник бачить лише кандидатів на свою вакансію (2)');
select tst.ok((select count(*) from public.applications) = 2, 'керівник бачить лише відгуки на свою вакансію (2)');
select tst.ok(tst.rows($$update public.candidates set city = 'Одеса' where id = '30000000-0000-0000-0000-000000000001'$$) = 0,
              'керівник не може редагувати кандидата');
select tst.ok((select count(*) from public.email_messages) = 0, 'керівник не бачить листування');

-- ---------------------------------------------------------------------
\echo '--- 3. Видалення та кошик'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$delete from public.candidates where id = '30000000-0000-0000-0000-000000000003'$$,
                   'фізичне видалення кандидата заборонене');
select tst.blocked($$update public.candidates set deleted_at = now() where id = '30000000-0000-0000-0000-000000000003'$$,
                   'рекрутер без права видалення не може перемістити в кошик');

select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$update public.candidates set deleted_at = now() where id = '30000000-0000-0000-0000-000000000003'$$) = 1,
              'SUPER ADMIN переміщує кандидата в кошик');
select tst.ok((select count(*) from public.candidates) = 3, 'SUPER ADMIN бачить кошик (3 разом із видаленим)');

select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.candidates) = 2, 'рекрутер більше не бачить видаленого (2)');

select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(tst.rows($$update public.candidates set deleted_at = null where id = '30000000-0000-0000-0000-000000000003'$$) = 1,
              'SUPER ADMIN відновлює кандидата з кошика');

-- ---------------------------------------------------------------------
\echo '--- 4. Керування ролями: потрібні дозвіл і MFA'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$insert into public.user_roles (user_id, role_id)
                     select '00000000-0000-0000-0000-0000000000a2', id from public.roles where code = 'super_admin'$$,
                   'рекрутер не може видати собі SUPER ADMIN');
select tst.blocked($$update public.profiles set mfa_required = false where id = '00000000-0000-0000-0000-0000000000a2'$$,
                   'рекрутер не може вимкнути собі MFA');
select tst.ok(tst.rows($$update public.profiles set phone = '+380000000000' where id = '00000000-0000-0000-0000-0000000000a2'$$) = 1,
              'рекрутер може змінити свій телефон');

select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal1');
select tst.blocked($$insert into public.user_roles (user_id, role_id)
                     select '00000000-0000-0000-0000-0000000000a4', id from public.roles where code = 'admin'$$,
                   'SUPER ADMIN без підтвердження MFA не може змінювати ролі');

select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.ok(tst.rows($$insert into public.user_roles (user_id, role_id)
                         select '00000000-0000-0000-0000-0000000000a4', id from public.roles where code = 'admin'$$) = 1,
              'SUPER ADMIN з MFA призначає роль');
select tst.blocked($$delete from public.user_roles ur using public.roles r
                     where r.id = ur.role_id and r.code = 'super_admin'
                       and ur.user_id = '00000000-0000-0000-0000-0000000000a1'$$,
                   'не можна забрати роль в останнього SUPER ADMIN');
select tst.blocked($$update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a1'$$,
                   'не можна заблокувати останнього SUPER ADMIN');

-- ---------------------------------------------------------------------
\echo '--- 5. Журнал дій'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.audit_log) = 0, 'рекрутер не бачить журнал дій');
select public.log_event('view_file', 'documents', 'test-doc', '{"reason": "тест"}');

select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok((select count(*) from public.audit_log where action = 'soft_delete' and entity = 'candidates') = 1,
              'переміщення в кошик записано в журнал');
select tst.ok((select count(*) from public.audit_log where action = 'restore' and entity = 'candidates') = 1,
              'відновлення записано в журнал');
select tst.ok((select count(*) from public.audit_log
               where action = 'view_file' and actor_id = '00000000-0000-0000-0000-0000000000a2') = 1,
              'перегляд файлу записано в журнал з автором');
select tst.ok((select count(*) from public.audit_log where after ? 'search_tsv') = 0,
              'службові колонки не потрапляють у журнал');

select tst.login('00000000-0000-0000-0000-0000000000a6');
select tst.blocked($$select public.log_event('export', 'candidates', null)$$, 'заблокований користувач не пише в журнал');

reset role;
select tst.blocked($$update public.audit_log set action = 'x'$$, 'журнал не змінює навіть власник БД');
select tst.blocked($$delete from public.audit_log$$, 'журнал не видаляє навіть власник БД');
set role authenticated;

-- ---------------------------------------------------------------------
\echo '--- 6. Воронка: етапи, переходи, причина відмови, історія'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$update public.applications set stage_id = (select id from public.pipeline_stages where code = 'rejected')
                     where id = '40000000-0000-0000-0000-000000000001'$$,
                   'відмова без причини заборонена');
select tst.ok(tst.rows($$update public.applications
                         set stage_id = (select id from public.pipeline_stages where code = 'rejected'),
                             rejection_reason_id = (select id from public.rejection_reasons where name = 'Не відповідає вимогам')
                         where id = '40000000-0000-0000-0000-000000000001'$$) = 1,
              'відмова з причиною зберігається');
select tst.ok((select closed_at is not null from public.applications where id = '40000000-0000-0000-0000-000000000001'),
              'відгук із відмовою отримує дату закриття');
select tst.ok((select count(*) from public.application_stage_history where application_id = '40000000-0000-0000-0000-000000000001') = 2,
              'історія етапів: створення + відмова');
select tst.ok((select count(*) from public.applications where id = '40000000-0000-0000-0000-000000000004') = 1
          and (select stage_id from public.applications where id = '40000000-0000-0000-0000-000000000004')
              = (select id from public.pipeline_stages where code = 'new'),
              'той самий кандидат в іншій вакансії має свій незалежний етап');

reset role;
insert into public.pipelines (id, name) values ('50000000-0000-0000-0000-000000000001', 'Інша воронка');
insert into public.pipeline_stages (id, pipeline_id, code, name, sort_order)
values ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'other', 'Чужий етап', 1);
insert into public.stage_transitions (from_stage_id, to_stage_id)
select f.id, t.id from public.pipeline_stages f, public.pipeline_stages t
where f.code = 'new' and t.code = 'resume_processed' and f.pipeline_id = t.pipeline_id;
insert into public.stage_transitions (from_stage_id, to_stage_id, required_fields)
select f.id, t.id, array['next_action_at'] from public.pipeline_stages f, public.pipeline_stages t
where f.code = 'resume_processed' and t.code = 'first_contact' and f.pipeline_id = t.pipeline_id;
set role authenticated;

-- Правила етапів перевіряємо від імені SUPER ADMIN: відгук у вакансії іншого рекрутера
-- (з етапу 4 рекрутер змінює лише свої воронки — це окремо в 40_pipeline_tests)
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.blocked($$update public.applications set stage_id = '50000000-0000-0000-0000-000000000002'
                     where id = '40000000-0000-0000-0000-000000000002'$$,
                   'етап з чужої воронки заборонений');
select tst.blocked($$update public.applications set stage_id = (select id from public.pipeline_stages where code = 'offer')
                     where id = '40000000-0000-0000-0000-000000000002'$$,
                   'перехід «Новий → Оффер» заборонений налаштуваннями');
select tst.ok(tst.rows($$update public.applications set stage_id = (select id from public.pipeline_stages where code = 'resume_processed')
                         where id = '40000000-0000-0000-0000-000000000002'$$) = 1,
              'дозволений перехід «Новий → Резюме опрацьовано»');
select tst.blocked($$update public.applications set stage_id = (select id from public.pipeline_stages where code = 'first_contact')
                     where id = '40000000-0000-0000-0000-000000000002'$$,
                   'перехід без обов''язкового поля «наступна дія» заборонений');
select tst.ok(tst.rows($$update public.applications set next_action_at = now() + interval '1 day',
                         stage_id = (select id from public.pipeline_stages where code = 'first_contact')
                         where id = '40000000-0000-0000-0000-000000000002'$$) = 1,
              'перехід із заповненим полем дозволений');
select tst.blocked($$insert into public.applications (candidate_id, vacancy_id, stage_id)
                     select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', id
                     from public.pipeline_stages where code = 'new' and pipeline_id = (select id from public.pipelines where is_default)$$,
                   'повторний відгук того ж кандидата на ту ж вакансію заборонений');

reset role;
select tst.ok((select count(*) from public.events where type = 'application.stage_changed') = 3,
              'кожна зміна етапу створює подію для автоматизацій (3)');
set role authenticated;

-- ---------------------------------------------------------------------
\echo '--- 7. Пошук дублікатів'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.find_candidate_duplicates(p_phone => '067 123 45 67')
               where candidate_id = '30000000-0000-0000-0000-000000000001' and matched_on = 'phone') = 1,
              'дубль за телефоном в іншому форматі знайдено');
select tst.ok((select count(*) from public.find_candidate_duplicates(p_email => '  PETRO@mail.com ')
               where matched_on = 'email') = 1,
              'дубль за email без урахування регістру знайдено');
select tst.ok((select count(*) from public.find_candidate_duplicates(p_full_name => 'Іваненко Петро Олексиович', p_city => 'Київ')
               where candidate_id = '30000000-0000-0000-0000-000000000001' and match_type = 'probable') = 1,
              'ймовірний дубль за ПІБ з помилкою знайдено');
select tst.ok((select count(*) from public.find_candidate_duplicates(p_full_name => 'Петренко Ганна', p_city => 'Київ')) = 0,
              'різні люди не вважаються дублікатами');

select tst.login('00000000-0000-0000-0000-0000000000a5');
select tst.blocked($$select * from public.find_candidate_duplicates(p_phone => '0671234567')$$,
                   'без прав пошук дублікатів недоступний');

-- ---------------------------------------------------------------------
\echo '--- 8. Секрети пошти'
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select google_email from public.email_accounts) = 'rec1.kan@gmail.com', 'рекрутер бачить свою скриньку');
select tst.blocked($$select refresh_token_encrypted from public.email_accounts$$,
                   'токен Gmail недоступний навіть власнику скриньки');
select tst.login('00000000-0000-0000-0000-0000000000a3');
select tst.ok((select count(*) from public.email_accounts) = 0, 'інший рекрутер не бачить чужу скриньку');

-- ---------------------------------------------------------------------
\echo '--- 9. Конструктор: модуль «Адаптація» з власними правами'
reset role;
insert into public.modules (id, code, name, status) values
  ('60000000-0000-0000-0000-000000000001', 'onboarding', 'Адаптація', 'published');
insert into public.entities (id, module_id, code, name) values
  ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'onboarding_plan', 'План адаптації');
insert into public.fields (entity_id, code, name, type, is_required) values
  ('60000000-0000-0000-0000-000000000002', 'mentor', 'Наставник', 'user', true),
  ('60000000-0000-0000-0000-000000000002', 'start_date', 'Дата виходу', 'date', true);
insert into public.permissions (code, module, name) values
  ('entity:onboarding_plan.read',   'onboarding', 'Перегляд планів адаптації'),
  ('entity:onboarding_plan.create', 'onboarding', 'Створення планів адаптації');
select tst.blocked($$insert into public.records (entity_id, data)
                     select id, '{}' from public.entities where code = 'candidates'$$,
                   'записи системних сутностей не можна створювати через конструктор');
set role authenticated;

select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$insert into public.records (entity_id, data, candidate_id)
                     values ('60000000-0000-0000-0000-000000000002', '{"start_date": "2026-12-01"}', '30000000-0000-0000-0000-000000000001')$$,
                   'без дозволу модуля запис створити не можна');

reset role;
insert into public.role_permissions (role_id, permission_code, scope)
select r.id, p, 'own' from public.roles r,
  unnest(array['entity:onboarding_plan.read', 'entity:onboarding_plan.create']) p
where r.code = 'recruiter';
set role authenticated;

select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok(tst.rows($$insert into public.records (entity_id, data, candidate_id)
                         values ('60000000-0000-0000-0000-000000000002', '{"start_date": "2026-12-01"}', '30000000-0000-0000-0000-000000000001')$$) = 1,
              'після надання дозволу рекрутер створює запис модуля');
select tst.ok((select count(*) from public.records) = 1, 'автор бачить свій запис');
select tst.login('00000000-0000-0000-0000-0000000000a3');
select tst.ok((select count(*) from public.records) = 0, 'з областю «свої» інший рекрутер запису не бачить');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$insert into public.fields (entity_id, code, name, type)
                     values ('60000000-0000-0000-0000-000000000002', 'hack', 'Hack', 'text')$$,
                   'структуру модуля не можна змінити напряму, лише через публікацію');

reset role;
insert into public.config_versions (status, snapshot) values ('published', '{}');
select tst.blocked($$insert into public.config_versions (status, snapshot) values ('published', '{}')$$,
                   'одночасно може бути лише одна опублікована конфігурація');

\echo '=== Усі перевірки пройдено ==='
