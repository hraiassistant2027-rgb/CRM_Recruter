-- =====================================================================
-- Дашборд: воронка з відмовами і часом на етапах, причини відмов, джерела (за весь період,
-- усі вакансії або одна), тривалість роботи над поточними вакансіями.
-- security invoker: діють права користувача і поточний простір (KAN Talent / HomeHub).
-- =====================================================================
create or replace function public.dashboard_overview(p_vacancy uuid default null)
returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_pipeline uuid;
  v_today date := (now() at time zone 'Europe/Kyiv')::date;
  v_result jsonb;
begin
  select id into v_pipeline from public.pipelines where is_default limit 1;

  if to_regclass('pg_temp._dash_a') is null then
    create temp table _dash_a (id uuid primary key, source_id uuid, stage_kind text, rejection_reason_id uuid,
      reached int, dropped_at uuid) on commit drop;
  end if;
  truncate _dash_a;

  insert into _dash_a
  select a.id, coalesce(a.source_id, c.source_id), s.kind, a.rejection_reason_id,
         greatest(
           case when s.kind in ('open', 'offer', 'hired') then s.sort_order else 0 end,
           coalesce((select max(hs.sort_order) from public.application_stage_history h
                     join public.pipeline_stages hs on hs.id = h.to_stage_id
                     where h.application_id = a.id and hs.kind in ('open', 'offer', 'hired')), 0)),
         -- етап, на якому кандидат вибув (з якого його перевели у «Відмова» / «Відмовився»)
         case when s.kind in ('rejected', 'withdrawn') then
           (select h.from_stage_id from public.application_stage_history h
            where h.application_id = a.id and h.to_stage_id = a.stage_id
            order by h.changed_at desc limit 1) end
  from public.applications a
  join public.vacancies v on v.id = a.vacancy_id
  join public.pipeline_stages s on s.id = a.stage_id
  left join public.candidates c on c.id = a.candidate_id
  where a.deleted_at is null and v.status <> 'draft'
    and (p_vacancy is null or a.vacancy_id = p_vacancy);

  select jsonb_build_object(
    'funnel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', st.name,
               'reached', (select count(*) from _dash_a d where d.reached >= st.sort_order or d.dropped_at = st.id),
               'rejected_company', (select count(*) from _dash_a d where d.dropped_at = st.id and d.stage_kind = 'rejected'),
               'rejected_candidate', (select count(*) from _dash_a d where d.dropped_at = st.id and d.stage_kind = 'withdrawn'),
               'avg_hours', (
                 select round(avg(extract(epoch from (coalesce(x.next_at, now()) - x.changed_at)) / 3600))
                 from (select h.to_stage_id, h.changed_at,
                              lead(h.changed_at) over (partition by h.application_id order by h.changed_at, h.id) as next_at
                       from public.application_stage_history h
                       join _dash_a d on d.id = h.application_id) x
                 where x.to_stage_id = st.id))
             order by st.sort_order)
      from public.pipeline_stages st
      where st.pipeline_id = v_pipeline and st.is_active and st.kind in ('open', 'offer', 'hired')), '[]'),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(r.name, 'Причину не вказано'), 'side', x.side, 'count', x.cnt) order by x.cnt desc)
      from (select d.rejection_reason_id, case d.stage_kind when 'withdrawn' then 'candidate' else 'company' end as side, count(*) as cnt
            from _dash_a d where d.stage_kind in ('rejected', 'withdrawn') group by 1, 2) x
      left join public.rejection_reasons r on r.id = x.rejection_reason_id), '[]'),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(src.name, 'Без джерела'), 'color', coalesce(src.color, '#9CA3AF'), 'count', x.cnt) order by x.cnt desc)
      from (select d.source_id, count(*) as cnt from _dash_a d group by 1) x
      left join public.sources src on src.id = x.source_id), '[]'),
    'open_vacancies', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'days', v_today - v.opened_at,
                                          'color', coalesce(le.color, '#9CA3AF')) order by v_today - v.opened_at desc)
      from public.vacancies v
      left join public.legal_entities le on le.id = v.legal_entity_id
      where v.status in ('open', 'on_hold')), '[]'),
    'avg_open_days', (select round(avg(v_today - v.opened_at)) from public.vacancies v where v.status in ('open', 'on_hold'))
  ) into v_result;
  return v_result;
end $$;
revoke execute on function public.dashboard_overview(uuid) from public, anon;
grant execute on function public.dashboard_overview(uuid) to authenticated;
