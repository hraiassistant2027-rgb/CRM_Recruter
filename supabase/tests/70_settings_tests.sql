-- Налаштування воронки (порядок етапів)
\set QUIET on
set client_min_messages = notice;

\echo '--- 20. Порядок етапів'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1');
select public.swap_stage_order(
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'first_contact'),
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'awaiting_reply'));
select tst.ok((select sort_order from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'first_contact') = 4
          and (select sort_order from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'awaiting_reply') = 3,
              'адміністратор міняє етапи місцями');
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.blocked($$select public.swap_stage_order(
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'first_contact'),
  (select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.code = 'awaiting_reply'))$$,
  'рекрутер не змінює порядок етапів');
reset role;
\echo '=== Тести налаштувань пройдено ==='
