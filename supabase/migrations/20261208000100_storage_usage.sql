-- =====================================================================
-- Етап 10: скільки місця займають файли (резюме і їх перегляд) — для попередження адміністраторів
-- =====================================================================
create or replace function public.storage_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bytes bigint := 0;
  v_files bigint := 0;
begin
  if not app.has_permission('settings.manage') then
    raise exception 'Немає доступу' using errcode = 'insufficient_privilege';
  end if;
  if to_regclass('storage.objects') is not null then
    execute $q$select coalesce(sum((metadata->>'size')::bigint), 0), count(*) from storage.objects where bucket_id = 'resumes'$q$
      into v_bytes, v_files;
  end if;
  return jsonb_build_object('bytes', v_bytes, 'files', v_files);
end $$;
revoke execute on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
