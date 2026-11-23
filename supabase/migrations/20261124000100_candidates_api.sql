-- =====================================================================
-- Етап 3. Пошук у базі кандидатів
-- =====================================================================
-- Функція виконується з правами користувача (security invoker),
-- тож правила доступу (RLS) до кандидатів і резюме діють як завжди.

-- Перетворення пошукового рядка на запит повнотекстового пошуку з префіксами:
-- "іван автокад" -> 'іван':* & 'автокад':*
create or replace function app.prefix_tsquery(p text)
returns tsquery language sql immutable parallel safe as $$
  select case when count(*) = 0 then null
              else to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) end
  from (
    select regexp_replace(w, '[^[:alnum:]]', '', 'g') as w
    from regexp_split_to_table(app.search_text(p), '\s+') as w
  ) t
  where length(w) >= 2
$$;

create or replace function public.search_candidates(
  p_query          text    default null,
  p_city           text    default null,
  p_source_id      uuid    default null,
  p_owner_id       uuid    default null,
  p_review_status  text    default null,
  p_deleted        boolean default false,
  p_limit          int     default 50,
  p_offset         int     default 0)
returns table (
  id uuid, full_name text, current_position text, city text, phone text, email text,
  source_id uuid, owner_id uuid, review_status text, updated_at timestamptz, deleted_at timestamptz,
  matched_in text, total_count bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_tsq   tsquery := app.prefix_tsquery(v_query);
  v_phone text := case when v_query ~ '^[+0-9\s()-]+$' then app.normalize_phone(v_query) end;
  v_email text := case when v_query like '%@%' then lower(v_query) end;
  v_city  text := nullif(app.search_text(trim(p_city)), '');
  v_limit int  := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if v_query is null then
    return query
    select c.id, c.full_name, c.current_position, c.city, c.phone, c.email,
           c.source_id, c.owner_id, c.review_status, c.updated_at, c.deleted_at,
           null::text, count(*) over ()
    from public.candidates c
    where (case when p_deleted then c.deleted_at is not null else c.deleted_at is null end)
      and c.merged_into_id is null
      and (v_city is null or app.search_text(c.city) like v_city || '%')
      and (p_source_id is null or c.source_id = p_source_id)
      and (p_owner_id is null or c.owner_id = p_owner_id)
      and (p_review_status is null or c.review_status = p_review_status)
    order by c.updated_at desc
    limit v_limit offset greatest(coalesce(p_offset, 0), 0);
    return;
  end if;

  return query
  with hits as (
    select c.id as cid, 2.0::real as rank, 'phone'::text as m
      from public.candidates c where v_phone is not null and c.phone_e164 = v_phone
    union all
    select c.id, 2.0, 'email' from public.candidates c where v_email is not null and c.email_norm = v_email
    union all
    select c.id, 1.0 + ts_rank(c.search_tsv, v_tsq), 'profile'
      from public.candidates c where v_tsq is not null and c.search_tsv @@ v_tsq
    union all
    select d.candidate_id, ts_rank(d.text_tsv, v_tsq), 'resume'
      from public.documents d
      where v_tsq is not null and d.candidate_id is not null and d.deleted_at is null and d.text_tsv @@ v_tsq
  ),
  best as (
    select h.cid, max(h.rank) as rank, (array_agg(h.m order by h.rank desc))[1] as m
    from hits h group by h.cid
  )
  select c.id, c.full_name, c.current_position, c.city, c.phone, c.email,
         c.source_id, c.owner_id, c.review_status, c.updated_at, c.deleted_at,
         b.m, count(*) over ()
  from best b
  join public.candidates c on c.id = b.cid
  where (case when p_deleted then c.deleted_at is not null else c.deleted_at is null end)
    and c.merged_into_id is null
    and (v_city is null or app.search_text(c.city) like v_city || '%')
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_owner_id is null or c.owner_id = p_owner_id)
    and (p_review_status is null or c.review_status = p_review_status)
  order by b.rank desc, c.updated_at desc
  limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end $$;

revoke execute on function public.search_candidates(text, text, uuid, uuid, text, boolean, int, int) from public, anon;
grant execute on function public.search_candidates(text, text, uuid, uuid, text, boolean, int, int) to authenticated;

-- Короткі відомості про знайдені дублікати: ім'я показуємо лише тим, хто має доступ до картки
create or replace function public.describe_duplicates(
  p_phone text default null, p_email text default null, p_linkedin text default null,
  p_full_name text default null, p_city text default null, p_exclude uuid default null)
returns table (candidate_id uuid, match_type text, matched_on text, score real,
               accessible boolean, full_name text, city text, owner_name text)
language sql stable security invoker set search_path = '' as $$
  select d.candidate_id, d.match_type, d.matched_on, d.score,
         c.id is not null, c.full_name, c.city, p.full_name
  from public.find_candidate_duplicates(p_phone, p_email, p_linkedin, p_full_name, p_city) d
  left join public.candidates c on c.id = d.candidate_id      -- RLS: null, якщо немає доступу
  left join public.profiles p on p.id = d.owner_id
  where p_exclude is null or d.candidate_id <> p_exclude
  order by d.score desc
$$;

revoke execute on function public.describe_duplicates(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.describe_duplicates(text, text, text, text, text, uuid) to authenticated;
