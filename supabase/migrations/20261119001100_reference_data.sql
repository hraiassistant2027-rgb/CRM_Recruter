-- =====================================================================
-- 0011. Базові дані: дозволи, ролі, воронка, довідники, шаблони, меню
-- =====================================================================

insert into public.permissions (code, module, name) values
  ('candidates.read',       'candidates',   'Перегляд кандидатів'),
  ('candidates.create',     'candidates',   'Створення кандидатів і завантаження резюме'),
  ('candidates.update',     'candidates',   'Редагування кандидатів'),
  ('candidates.delete',     'candidates',   'Видалення кандидатів у кошик'),
  ('candidates.restore',    'candidates',   'Перегляд кошика і відновлення'),
  ('candidates.merge',      'candidates',   'Об''єднання дублікатів'),
  ('candidates.export',     'candidates',   'Експорт кандидатів'),
  ('import.manage',         'candidates',   'Імпорт архіву і керування пакетами'),
  ('vacancies.read',        'vacancies',    'Перегляд вакансій'),
  ('vacancies.manage',      'vacancies',    'Створення і редагування вакансій'),
  ('vacancies.delete',      'vacancies',    'Видалення вакансій'),
  ('vacancies.restore',     'vacancies',    'Відновлення вакансій'),
  ('applications.read',     'pipeline',     'Перегляд відгуків і воронки'),
  ('applications.create',   'pipeline',     'Додавання кандидата у вакансію'),
  ('applications.update',   'pipeline',     'Зміна етапу і полів відгуку'),
  ('applications.delete',   'pipeline',     'Видалення відгуків'),
  ('applications.restore',  'pipeline',     'Відновлення відгуків'),
  ('tasks.read',            'pipeline',     'Перегляд усіх задач'),
  ('tasks.create',          'pipeline',     'Створення задач'),
  ('email.read',            'communications', 'Перегляд листування'),
  ('email.send',            'communications', 'Надсилання листів'),
  ('email.accounts.manage', 'communications', 'Керування підключеними скриньками'),
  ('templates.manage',      'communications', 'Керування шаблонами листів'),
  ('interviews.manage',     'calendar',     'Призначення співбесід'),
  ('analytics.read',        'analytics',    'Перегляд дашборда і аналітики'),
  ('reports.read',          'analytics',    'Перегляд спільних звітів'),
  ('reports.create',        'analytics',    'Створення звітів'),
  ('settings.manage',       'settings',     'Довідники, об''єкти, етапи воронки'),
  ('users.manage',          'settings',     'Запрошення і блокування користувачів'),
  ('roles.manage',          'settings',     'Ролі та права доступу'),
  ('audit.read',            'settings',     'Перегляд журналу дій'),
  ('builder.edit',          'builder',      'Робота в конструкторі CRM (чернетки)'),
  ('builder.publish',       'builder',      'Публікація і відкат конфігурації');

insert into public.roles (code, name, description, is_system) values
  ('super_admin',    'SUPER ADMIN',          'Повний доступ до системи і конструктора', true),
  ('admin',          'Адміністратор',        'Повний доступ, крім керування ролями', true),
  ('recruiter',      'Рекрутер',             'Робота з базою кандидатів, вакансіями і воронкою', true),
  ('hiring_manager', 'Керівник-замовник',    'Бачить лише свої вакансії і кандидатів на них', true);

-- SUPER ADMIN — усі дозволи
insert into public.role_permissions (role_id, permission_code, scope)
select r.id, p.code, 'all' from public.roles r cross join public.permissions p
where r.code = 'super_admin';

-- Адміністратор — усе, крім ролей
insert into public.role_permissions (role_id, permission_code, scope)
select r.id, p.code, 'all' from public.roles r cross join public.permissions p
where r.code = 'admin' and p.code <> 'roles.manage';

-- Рекрутер
insert into public.role_permissions (role_id, permission_code, scope)
select r.id, v.code, v.scope
from public.roles r
cross join (values
  ('candidates.read', 'all'), ('candidates.create', 'all'), ('candidates.update', 'all'),
  ('vacancies.read', 'all'), ('vacancies.manage', 'own'),
  ('applications.read', 'all'), ('applications.create', 'all'), ('applications.update', 'all'),
  ('tasks.create', 'all'),
  ('email.read', 'all'), ('email.send', 'all'),
  ('interviews.manage', 'all'),
  ('analytics.read', 'all'), ('reports.read', 'all'), ('reports.create', 'all')
) as v(code, scope)
where r.code = 'recruiter';

-- Керівник-замовник
insert into public.role_permissions (role_id, permission_code, scope)
select r.id, v.code, v.scope
from public.roles r
cross join (values
  ('candidates.read', 'own'), ('vacancies.read', 'own'), ('applications.read', 'own'),
  ('tasks.create', 'all')
) as v(code, scope)
where r.code = 'hiring_manager';

-- Воронка за замовчуванням (13 етапів із ТЗ)
with p as (
  insert into public.pipelines (name, is_default) values ('Основна воронка', true) returning id
)
insert into public.pipeline_stages (pipeline_id, code, name, color, sort_order, kind, sla_days)
select p.id, s.code, s.name, s.color, s.ord, s.kind, s.sla
from p cross join (values
  ('new',               'Новий кандидат',          '#9CA3AF',  1, 'open',      2),
  ('resume_processed',  'Резюме опрацьовано',      '#60A5FA',  2, 'open',      2),
  ('first_contact',     'Перший контакт',          '#38BDF8',  3, 'open',      3),
  ('awaiting_reply',    'Очікує відповіді',        '#A78BFA',  4, 'open',      3),
  ('phone_interview',   'Телефонна співбесіда',    '#818CF8',  5, 'open',      5),
  ('manager_interview', 'Співбесіда з керівником', '#F59E0B',  6, 'open',      7),
  ('repeat_interview',  'Повторна співбесіда',     '#FBBF24',  7, 'open',      7),
  ('offer',             'Оффер',                   '#FACC15',  8, 'offer',     5),
  ('offer_accepted',    'Оффер прийнято',          '#A3E635',  9, 'offer',  null),
  ('awaiting_start',    'Очікує виходу',           '#4ADE80', 10, 'offer',  null),
  ('hired',             'Працевлаштований',        '#16A34A', 11, 'hired',  null),
  ('rejected',          'Відмова',                 '#EF4444', 12, 'rejected', null),
  ('withdrawn',         'Кандидат відмовився',     '#F97316', 13, 'withdrawn', null)
) as s(code, name, color, ord, kind, sla);

insert into public.sources (name, sort_order) values
  ('Work.ua', 1), ('robota.ua', 2), ('LinkedIn', 3), ('Рекомендація', 4),
  ('Сайт компанії', 5), ('Telegram', 6), ('Архів резюме', 7), ('Інше', 99);

insert into public.rejection_reasons (name, side, sort_order) values
  ('Не відповідає вимогам',            'company',   1),
  ('Не пройшов співбесіду',            'company',   2),
  ('Завищені зарплатні очікування',    'company',   3),
  ('Вакансію закрито або призупинено', 'company',   4),
  ('Обрав іншу пропозицію',            'candidate', 1),
  ('Не влаштовує зарплата',            'candidate', 2),
  ('Не влаштовує локація чи об''єкт',  'candidate', 3),
  ('Не виходить на зв''язок',          'candidate', 4),
  ('Інша причина',                     'candidate', 9);

insert into public.email_templates (name, category, subject, body_html, variables) values
  ('Запрошення на співбесіду', 'invite',
   'Запрошення на співбесіду: {{vacancy.title}}',
   '<p>Добрий день, {{candidate.first_name}}!</p><p>Дякуємо за інтерес до вакансії «{{vacancy.title}}». Запрошуємо вас на співбесіду {{interview.date}} о {{interview.time}}.</p><p>Місце: {{interview.location}}</p><p>Будь ласка, підтвердьте участь у відповіді на цей лист.</p><p>З повагою,<br>{{recruiter.name}}<br>{{recruiter.phone}}</p>',
   array['candidate.first_name', 'vacancy.title', 'interview.date', 'interview.time', 'interview.location', 'recruiter.name', 'recruiter.phone']),
  ('Запрошення на наступний етап', 'next_stage',
   'Наступний етап відбору: {{vacancy.title}}',
   '<p>Добрий день, {{candidate.first_name}}!</p><p>Раді повідомити, що ви пройшли на наступний етап відбору на вакансію «{{vacancy.title}}». Пропонуємо зустрітися {{interview.date}} о {{interview.time}}, місце: {{interview.location}}.</p><p>З повагою,<br>{{recruiter.name}}</p>',
   array['candidate.first_name', 'vacancy.title', 'interview.date', 'interview.time', 'interview.location', 'recruiter.name']),
  ('Відмова', 'rejection',
   'Щодо вакансії {{vacancy.title}}',
   '<p>Добрий день, {{candidate.first_name}}!</p><p>Дякуємо за час і інтерес до вакансії «{{vacancy.title}}». На жаль, зараз ми не готові запропонувати вам цю посаду. З вашої згоди збережемо резюме і зв''яжемося, якщо з''явиться відповідна вакансія.</p><p>Бажаємо успіхів!<br>{{recruiter.name}}</p>',
   array['candidate.first_name', 'vacancy.title', 'recruiter.name']),
  ('Підтвердження отримання резюме', 'received',
   'Ваше резюме отримано',
   '<p>Добрий день, {{candidate.first_name}}!</p><p>Дякуємо, ми отримали ваше резюме на вакансію «{{vacancy.title}}». Рекрутер зв''яжеться з вами найближчим часом.</p><p>З повагою,<br>{{recruiter.name}}</p>',
   array['candidate.first_name', 'vacancy.title', 'recruiter.name']),
  ('Повідомлення про оффер', 'offer',
   'Пропозиція про роботу: {{vacancy.title}}',
   '<p>Добрий день, {{candidate.first_name}}!</p><p>Раді запропонувати вам посаду «{{vacancy.title}}». Деталі пропозиції: {{offer.details}}.</p><p>Очікуємо на вашу відповідь до {{offer.deadline}}.</p><p>З повагою,<br>{{recruiter.name}}<br>{{recruiter.phone}}</p>',
   array['candidate.first_name', 'vacancy.title', 'offer.details', 'offer.deadline', 'recruiter.name', 'recruiter.phone']);

insert into public.entities (code, name, name_plural, is_system, system_table, title_field) values
  ('candidates',   'Кандидат', 'Кандидати', true, 'candidates',   'full_name'),
  ('vacancies',    'Вакансія', 'Вакансії',  true, 'vacancies',    'title'),
  ('applications', 'Відгук',   'Відгуки',   true, 'applications', 'id');

insert into public.menu_items (name, icon, sort_order, target_type, target_ref, required_permission, admin_only) values
  ('Dashboard',            'layout-dashboard', 1,  'system', 'dashboard',  'analytics.read',    false),
  ('База кандидатів',      'users',            2,  'system', 'candidates', 'candidates.read',   false),
  ('Вакансії',             'briefcase',        3,  'system', 'vacancies',  'vacancies.read',    false),
  ('Воронка рекрутингу',   'kanban',           4,  'system', 'pipeline',   'applications.read', false),
  ('Календар',             'calendar',         5,  'system', 'calendar',   'interviews.manage', false),
  ('Комунікації',          'mail',             6,  'system', 'inbox',      'email.read',        false),
  ('Рекрутери',            'user-check',       7,  'system', 'recruiters', 'analytics.read',    false),
  ('Звіти та аналітика',   'bar-chart-3',      8,  'system', 'reports',    'reports.read',      false),
  ('Шаблони листів',       'file-text',        9,  'system', 'templates',  'templates.manage',  false),
  ('Налаштування',         'settings',         10, 'system', 'settings',   'settings.manage',   false),
  ('Конструктор CRM',      'blocks',           11, 'system', 'builder',    'builder.edit',      true);

-- ---------------------------------------------------------------------
-- Призначення першого SUPER ADMIN (виконується один раз у SQL Editor Supabase
-- після того, як користувача запрошено через Authentication → Invite user)
-- ---------------------------------------------------------------------
create or replace function app.bootstrap_super_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if current_user = 'authenticated' or current_user = 'anon' then
    raise exception 'Лише для службового використання' using errcode = 'insufficient_privilege';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Користувача % не знайдено: спершу запросіть його', p_email;
  end if;
  insert into public.user_roles (user_id, role_id)
  select v_user, r.id from public.roles r where r.code = 'super_admin'
  on conflict do nothing;
end $$;
revoke execute on function app.bootstrap_super_admin(text) from public, authenticated;
