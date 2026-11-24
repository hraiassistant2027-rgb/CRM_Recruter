-- =====================================================================
-- Зміна порядку етапів воронки (Налаштування → Етапи воронки)
-- =====================================================================
-- Обмін місцями двох сусідніх етапів однієї воронки. Унікальність порядку перевіряється
-- в кінці транзакції (deferrable), тож обмін виконується атомарно. Права — settings.manage (RLS).
create or replace function public.swap_stage_order(p_a uuid, p_b uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  a public.pipeline_stages%rowtype;
  b public.pipeline_stages%rowtype;
  v_rows int;
begin
  select * into a from public.pipeline_stages where id = p_a;
  select * into b from public.pipeline_stages where id = p_b;
  if a.id is null or b.id is null or a.pipeline_id <> b.pipeline_id then
    raise exception 'Етапи не знайдено або вони з різних воронок' using errcode = 'invalid_parameter_value';
  end if;
  update public.pipeline_stages set sort_order = b.sort_order where id = a.id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Немає права змінювати етапи воронки' using errcode = 'insufficient_privilege';
  end if;
  update public.pipeline_stages set sort_order = a.sort_order where id = b.id;
end $$;
revoke execute on function public.swap_stage_order(uuid, uuid) from public, anon;
grant execute on function public.swap_stage_order(uuid, uuid) to authenticated;
