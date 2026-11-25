-- Конструктор CRM (етап 8)
\set QUIET on
set client_min_messages = notice;

\echo '--- 28. Конструктор: власні поля і ролі'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok(public.builder_save_field(null, 'candidates', 'Посвідчення водія', 'select', true, '["B", "C", "C", " B ", "CE"]', 'Категорія', true) is not null,
              'SUPER ADMIN додає поле-список у картку кандидата');
select tst.ok((select options from public.fields where name = 'Посвідчення водія') = '["B", "C", "CE"]'::jsonb, 'варіанти без дублікатів і пробілів');
select tst.ok((select code from public.fields where name = 'Посвідчення водія') ~ '^f_[0-9a-f]{10}$', 'код поля згенеровано');
select tst.ok(public.builder_save_field(null, 'vacancies', 'Бюджет найму', 'money') is not null, 'поле у вакансії');
select tst.ok(public.builder_save_field(null, 'candidates', 'Нотатка ТБ', 'text') is not null, 'текстове поле');
select tst.blocked($$select public.builder_save_field(null, 'candidates', 'посвідчення водія', 'text')$$, 'дубль назви не дозволено');
select tst.blocked($$select public.builder_save_field(null, 'candidates', 'Список', 'select', false, '[]')$$, 'список без варіантів не дозволено');
select tst.blocked($$select public.builder_save_field(null, 'applications', 'Поле Х', 'text')$$, 'лише кандидати і вакансії');
select tst.blocked($$select public.builder_save_field((select id from public.fields where name = 'Бюджет найму'), 'vacancies', 'Бюджет найму', 'date')$$,
                   'тип поля не змінюється');
select public.builder_save_field((select id from public.fields where name = 'Нотатка ТБ'), 'candidates', 'Нотатка з ТБ', 'long_text');
select tst.ok((select type from public.fields where name = 'Нотатка з ТБ') = 'long_text', 'текст → довгий текст і перейменування');
select public.builder_move_field((select id from public.fields where name = 'Нотатка з ТБ'), true);
select tst.ok((select f.name from public.fields f join public.entities e on e.id = f.entity_id
               where e.code = 'candidates' and not f.is_system order by sort_order, f.id::text limit 1) = 'Нотатка з ТБ', 'порядок полів змінюється');
select public.builder_archive_field((select id from public.fields where name = 'Нотатка з ТБ'), true);
select tst.ok((select archived_at is not null from public.fields where name = 'Нотатка з ТБ'), 'поле архівовано, не видалено');
select tst.blocked($$insert into public.fields (entity_id, code, name, type) select id, 'zz', 'Пряме', 'text' from public.entities where code = 'candidates'$$,
                   'напряму в метадані писати не можна');

-- Ролі (лише з підтвердженим кодом MFA)
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.ok(tst.rows($$insert into public.roles (id, code, name) values ('97000000-0000-0000-0000-000000000001', 'hr_inspector', 'Кадровик-перевіряльник')$$) = 1,
              'SUPER ADMIN створює роль');
select tst.ok(tst.rows($$insert into public.role_permissions (role_id, permission_code, scope) values ('97000000-0000-0000-0000-000000000001', 'candidates.read', 'own')$$) = 1,
              'і надає їй права');
select tst.blocked($$delete from public.role_permissions where role_id = (select id from public.roles where code = 'super_admin') and permission_code = 'users.manage'$$,
                   'права SUPER ADMIN не змінюються');
select tst.blocked($$delete from public.roles where code = 'recruiter'$$, 'системну роль не видалити');
select tst.ok(tst.rows($$delete from public.roles where id = '97000000-0000-0000-0000-000000000001'$$) = 1, 'свою роль без користувачів видалити можна');

select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$select public.builder_save_field(null, 'candidates', 'Хак', 'text')$$, 'рекрутер не працює в конструкторі');
select tst.blocked($$insert into public.roles (code, name) values ('x_role', 'Х')$$, 'рекрутер не створює ролі');
reset role;
\echo '=== Тести конструктора пройдено ==='
