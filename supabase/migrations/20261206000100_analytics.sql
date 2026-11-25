-- =====================================================================
-- Етап 7: аналітика рекрутингу (одним викликом, з урахуванням прав користувача — security invoker)
-- Період — дати за київським часом включно. Фільтри: рекрутер вакансії, юрособа, проєкт, клас вакансії.
-- =====================================================================
create or replace function public.analytics_report(
  p_from date,
  p_to date,
  p_recruiter uuid default null,
  p_entity uuid default null,
  p_project uuid default null,
  p_class text default null
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Europe/Kyiv';
  v_end   timestamptz := ((p_to + 1)::timestamp) at time zone 'Europe/Kyiv';
  v_today date := (now() at time zone 'Europe/Kyiv')::date;
  v_bucket text := case when p_to - p_from > 92 then 'month' else 'week' end;
  v_pipeline uuid;
  v_manager_order int;
  v_offer_order int;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Невірний період' using errcode = '22023';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'Період не більше 3 років' using errcode = '22023';
  end if;

  select id into v_pipeline from public.pipelines where is_default limit 1;
  select min(sort_order) into v_manager_order from public.pipeline_stages where pipeline_id = v_pipeline and code = 'manager_interview';
  select min(sort_order) into v_offer_order from public.pipeline_stages where pipeline_id = v_pipeline and kind = 'offer';

  if to_regclass('pg_temp._an_v') is null then
  create temp table _an_v (id uuid primary key, recruiter_id uuid, status text, opened_at date, closed_at date, deadline date) on commit drop;
  create temp table _an_a (id uuid primary key, vacancy_id uuid, candidate_id uuid, source_id uuid, recruiter_id uuid,
    created_at timestamptz, hired_at timestamptz, stage_kind text, rejection_reason_id uuid, reached int) on commit drop;
  end if;
  truncate _an_v, _an_a;

  -- Вакансії за фільтрами (без чернеток)
  insert into _an_v
  select v.id, v.recruiter_id, v.status, v.opened_at, v.closed_at,
         greatest(v.opened_at, coalesce(v.request_adjusted_at, v.opened_at))
           + coalesce(v.planned_close_days, case v.difficulty_class when 'A' then 30 when 'B' then 45 when 'C' then 90 when 'D' then 180 end)
  from public.vacancies v
  where v.status <> 'draft'
    and (p_recruiter is null or v.recruiter_id = p_recruiter)
    and (p_entity is null or v.legal_entity_id = p_entity)
    and (p_project is null or v.project_id = p_project)
    and (p_class is null or v.difficulty_class = p_class);

  -- Усі відгуки цих вакансій; reached — найдальший етап, до якого кандидат доходив (без відмов)
  insert into _an_a
  select a.id, a.vacancy_id, a.candidate_id, coalesce(a.source_id, c.source_id), vv.recruiter_id, a.created_at, a.hired_at, s.kind,
         a.rejection_reason_id,
         greatest(
           case when s.kind in ('open', 'offer', 'hired') then s.sort_order else 0 end,
           coalesce((select max(hs.sort_order) from public.application_stage_history h
                     join public.pipeline_stages hs on hs.id = h.to_stage_id
                     where h.application_id = a.id and hs.kind in ('open', 'offer', 'hired')), 0))
  from public.applications a
  join _an_v vv on vv.id = a.vacancy_id
  join public.pipeline_stages s on s.id = a.stage_id
  left join public.candidates c on c.id = a.candidate_id
  where a.deleted_at is null;

  select jsonb_build_object(
    'bucket', v_bucket,
    'kpi', jsonb_build_object(
      'new_candidates', (select count(*) from public.candidates c
                         where c.deleted_at is null and c.merged_into_id is null and c.created_at >= v_start and c.created_at < v_end
                           and (p_recruiter is null or c.created_by = p_recruiter)),
      'applications', (select count(*) from _an_a where created_at >= v_start and created_at < v_end),
      'interviews', (select count(*) from public.interviews i join _an_a a on a.id = i.application_id
                     where i.starts_at >= v_start and i.starts_at < least(v_end, now()) and i.status not in ('cancelled', 'no_show')),
      'offers', (select count(distinct h.application_id) from public.application_stage_history h
                 join public.pipeline_stages hs on hs.id = h.to_stage_id and hs.kind = 'offer'
                 join _an_a a on a.id = h.application_id
                 where h.changed_at >= v_start and h.changed_at < v_end),
      'hires', (select count(*) from _an_a where stage_kind = 'hired' and hired_at >= v_start and hired_at < v_end),
      'avg_days_to_hire', (select round(avg(extract(epoch from hired_at - created_at) / 86400)) from _an_a
                           where stage_kind = 'hired' and hired_at >= v_start and hired_at < v_end),
      'vacancies_opened', (select count(*) from _an_v where opened_at between p_from and p_to),
      'vacancies_closed', (select count(*) from _an_v where status = 'closed' and closed_at between p_from and p_to),
      'avg_close_days', (select round(avg(closed_at - opened_at)) from _an_v where status = 'closed' and closed_at between p_from and p_to),
      'open_now', (select count(*) from _an_v where status in ('open', 'on_hold')),
      'overdue_now', (select count(*) from _an_v where status in ('open', 'on_hold') and deadline < v_today)
    ),
    -- Воронка: скільки відгуків, створених у періоді, дійшли до кожного етапу
    'funnel', coalesce((
      select jsonb_agg(jsonb_build_object('name', s.name, 'color', s.color, 'kind', s.kind,
               'count', (select count(*) from _an_a a where a.created_at >= v_start and a.created_at < v_end
                           and (a.reached >= s.sort_order or (s.sort_order = (select min(sort_order) from public.pipeline_stages where pipeline_id = v_pipeline)))))
             order by s.sort_order)
      from public.pipeline_stages s
      where s.pipeline_id = v_pipeline and s.is_active and s.kind in ('open', 'offer', 'hired')), '[]'),
    'rejections', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(r.name, 'Без причини'), 'side', coalesce(r.side, x.side), 'count', x.cnt) order by x.cnt desc)
      from (select a.rejection_reason_id, case a.stage_kind when 'withdrawn' then 'candidate' else 'company' end as side, count(*) as cnt
            from _an_a a where a.stage_kind in ('rejected', 'withdrawn') and a.created_at >= v_start and a.created_at < v_end
            group by 1, 2) x
      left join public.rejection_reasons r on r.id = x.rejection_reason_id), '[]'),
    -- Джерела: прихід кандидатів і що з ними стало далі
    'sources', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.hires desc, t.applications desc, t.candidates desc)
      from (
        select coalesce(src.name, 'Без джерела') as name, coalesce(src.color, '#D1D5DB') as color,
               coalesce(cc.cnt, 0) as candidates, coalesce(aa.apps, 0) as applications, coalesce(aa.manager, 0) as manager,
               coalesce(aa.offers, 0) as offers, coalesce(aa.hires, 0) as hires
        from (select coalesce(c.source_id, '00000000-0000-0000-0000-000000000000'::uuid) as source_id, count(*) as cnt from public.candidates c
              where c.deleted_at is null and c.merged_into_id is null and c.created_at >= v_start and c.created_at < v_end
                and (p_recruiter is null or c.created_by = p_recruiter)
              group by 1) cc
        full join (select coalesce(a.source_id, '00000000-0000-0000-0000-000000000000'::uuid) as source_id, count(*) as apps,
                          count(*) filter (where v_manager_order is not null and a.reached >= v_manager_order) as manager,
                          count(*) filter (where v_offer_order is not null and a.reached >= v_offer_order) as offers,
                          count(*) filter (where a.stage_kind = 'hired') as hires
                   from _an_a a where a.created_at >= v_start and a.created_at < v_end
                   group by 1) aa on aa.source_id = cc.source_id
        left join public.sources src on src.id = coalesce(cc.source_id, aa.source_id)
      ) t), '[]'),
    -- Рекрутери
    'recruiters', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.hires desc, t.name)
      from (
        select p.id, p.full_name as name,
               (select count(*) from _an_v v where v.recruiter_id = p.id and v.status in ('open', 'on_hold')) as open_now,
               (select count(*) from _an_v v where v.recruiter_id = p.id and v.status in ('open', 'on_hold') and v.deadline < v_today) as overdue,
               (select count(*) from _an_v v where v.recruiter_id = p.id and v.status = 'closed' and v.closed_at between p_from and p_to) as closed,
               (select round(avg(v.closed_at - v.opened_at)) from _an_v v where v.recruiter_id = p.id and v.status = 'closed' and v.closed_at between p_from and p_to) as avg_close_days,
               (select count(*) from public.candidates c where c.created_by = p.id and c.deleted_at is null and c.created_at >= v_start and c.created_at < v_end) as candidates,
               (select count(*) from public.interviews i join _an_a a on a.id = i.application_id
                where a.recruiter_id = p.id and i.starts_at >= v_start and i.starts_at < least(v_end, now()) and i.status not in ('cancelled', 'no_show')) as interviews,
               (select count(*) from _an_a a where a.recruiter_id = p.id and a.stage_kind = 'hired' and a.hired_at >= v_start and a.hired_at < v_end) as hires
        from public.profiles p
        where p.id in (select recruiter_id from _an_v where recruiter_id is not null)
           or (p_recruiter is not null and p.id = p_recruiter)
      ) t), '[]'),
    -- Динаміка по тижнях або місяцях
    'dynamics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period', b::date,
               'opened', (select count(*) from _an_v v where date_trunc(v_bucket, v.opened_at) = b),
               'closed', (select count(*) from _an_v v where v.status = 'closed' and date_trunc(v_bucket, v.closed_at) = b),
               'hires', (select count(*) from _an_a a where a.stage_kind = 'hired' and date_trunc(v_bucket, (a.hired_at at time zone 'Europe/Kyiv')) = b),
               'candidates', (select count(*) from public.candidates c where c.deleted_at is null and c.merged_into_id is null
                                and (p_recruiter is null or c.created_by = p_recruiter)
                                and date_trunc(v_bucket, (c.created_at at time zone 'Europe/Kyiv')) = b))
             order by b)
      from generate_series(date_trunc(v_bucket, p_from::timestamp), date_trunc(v_bucket, p_to::timestamp),
                           case v_bucket when 'month' then interval '1 month' else interval '1 week' end) b), '[]')
  ) into v_result;

  return v_result;
end $$;
revoke execute on function public.analytics_report(date, date, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.analytics_report(date, date, uuid, uuid, uuid, text) to authenticated, service_role;
comment on function public.analytics_report is 'Аналітика рекрутингу за період (етап 7). Дані — з урахуванням прав користувача.';
