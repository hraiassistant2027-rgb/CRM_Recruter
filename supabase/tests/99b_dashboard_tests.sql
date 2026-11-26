-- Дашборд
\set QUIET on
set client_min_messages = notice;
\echo '--- 31. Дашборд'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select tst.ok(jsonb_array_length(public.dashboard_overview() -> 'funnel') >= 5, 'воронка дашборда має етапи');
select tst.ok((public.dashboard_overview() -> 'funnel' -> 0 ->> 'reached')::int >= 1, 'на першому етапі є кандидати');
select tst.ok(jsonb_typeof(public.dashboard_overview() -> 'sources') = 'array', 'джерела');
select tst.ok(jsonb_typeof(public.dashboard_overview() -> 'open_vacancies') = 'array', 'поточні вакансії');
select tst.ok((public.dashboard_overview('20000000-0000-0000-0000-000000000002') -> 'funnel' -> 0 ->> 'reached')::int
              <= (public.dashboard_overview() -> 'funnel' -> 0 ->> 'reached')::int, 'фільтр за вакансією');
select set_config('request.headers', '{"x-workspace":"homehub"}', false);
select tst.ok(not exists (select 1 from jsonb_array_elements(public.dashboard_overview() -> 'open_vacancies') e
                          where e ->> 'title' = 'Виконроб'), 'у HomeHub — лише його вакансії');
select set_config('request.headers', '', false);
reset role;
\echo '=== Тести дашборда пройдено ==='
