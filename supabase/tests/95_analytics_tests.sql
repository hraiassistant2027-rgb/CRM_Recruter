-- Аналітика (етап 7)
\set QUIET on
set client_min_messages = notice;

\echo '--- 27. Аналітика'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select tst.ok((public.analytics_report(current_date - 30, current_date + 1) ? 'kpi'), 'звіт повертає показники');
select tst.ok((public.analytics_report(current_date - 30, current_date + 1) -> 'kpi' ->> 'applications')::int >= 1, 'відгуки за період пораховано');
select tst.ok(jsonb_array_length(public.analytics_report(current_date - 30, current_date + 1) -> 'funnel') >= 5, 'воронка має етапи');
select tst.ok((public.analytics_report(current_date - 30, current_date + 1) -> 'funnel' -> 0 ->> 'count')::int
              >= (public.analytics_report(current_date - 30, current_date + 1) -> 'funnel' -> 1 ->> 'count')::int, 'воронка не зростає');
select tst.ok(jsonb_array_length(public.analytics_report(current_date - 30, current_date + 1) -> 'recruiters') >= 1, 'є рекрутери');
select tst.ok(public.analytics_report(current_date - 400, current_date) ->> 'bucket' = 'month', 'довгий період — по місяцях');
select tst.ok((public.analytics_report(current_date - 30, current_date + 1, p_class => 'D') -> 'kpi' ->> 'applications')::int = 0, 'фільтр за класом');
select tst.blocked($$select public.analytics_report(current_date, current_date - 1)$$, 'невірний період відхиляється');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((public.analytics_report(current_date - 30, current_date + 1) ? 'sources'), 'рекрутер бачить аналітику в межах своїх прав');
reset role;
\echo '=== Тести аналітики пройдено ==='
