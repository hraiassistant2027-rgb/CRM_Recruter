-- Етапи: додавання, видалення/архівування, набір етапів для вакансії
\set QUIET on
set client_min_messages = notice;
\echo '--- 36. Керування етапами'
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
select set_config('tst.new_stage', public.add_pipeline_stage('Тестове завдання', '#123456', 3, null, null)::text, false);
select tst.ok(exists (select 1 from public.pipeline_stages where id = current_setting('tst.new_stage')::uuid and kind = 'open'), 'Супер адміністратор додав етап');
select tst.ok(public.delete_pipeline_stage(current_setting('tst.new_stage')::uuid) = 'deleted', 'невикористаний етап видалено повністю');
select tst.blocked($$select public.delete_pipeline_stage((select s.id from public.pipeline_stages s join public.pipelines p on p.id = s.pipeline_id and p.is_default where s.kind = 'offer' limit 1))$$,
                   'службовий етап «Офер» видалити не можна');
select tst.login('00000000-0000-0000-0000-0000000000a2', 'aal2');
select tst.blocked($$select public.add_pipeline_stage('Зайвий', '#123456', null, null, null)$$, 'рекрутер не додає етапи');
reset role;

-- Набір етапів вакансії
select tst.ok((select count(*) from public.vacancies) > 0, 'є вакансії для перевірки');
set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select set_config('request.headers', '{"x-workspace":"kan"}', false);
insert into public.vacancy_hidden_stages (vacancy_id, stage_id)
select v.id, s.id from public.vacancies v, public.pipeline_stages s
 where v.id = (select id from public.vacancies where workspace_id = 'a1000000-0000-0000-0000-000000000001' limit 1)
   and s.pipeline_id = v.pipeline_id and s.code = 'polygraph';
select tst.ok((select count(*) from public.vacancy_hidden_stages) = 1, 'для вакансії вимкнено етап «Поліграф»');
select tst.blocked($$insert into public.vacancy_hidden_stages (vacancy_id, stage_id)
  select v.id, s.id from public.vacancies v, public.pipeline_stages s
   where v.id = (select id from public.vacancies where workspace_id = 'a1000000-0000-0000-0000-000000000001' limit 1)
     and s.pipeline_id = v.pipeline_id and s.kind = 'hired'$$, 'обов''язковий етап вимкнути не можна');
delete from public.vacancy_hidden_stages;
select set_config('request.headers', '', false);
reset role;
\echo '=== Тести етапів пройдено ==='
