-- =====================================================================
-- Етап 6. Співбесіди: права «свої вакансії», коментар до результату
-- =====================================================================

-- Рекрутер призначає і змінює співбесіди лише у своїх вакансіях (як і воронку)
update public.role_permissions rp
   set scope = 'own'
  from public.roles r
 where rp.role_id = r.id and r.code = 'recruiter' and rp.permission_code = 'interviews.manage';

create or replace function app.can_manage_interviews_for(p_application uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    where a.id = p_application and a.deleted_at is null
      and app.application_in_scope('interviews.manage', a.recruiter_id, a.vacancy_id))
$$;

create or replace function app.can_manage_interview(p_interview uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.interviews i
    where i.id = p_interview and app.can_manage_interviews_for(i.application_id))
$$;

drop policy interviews_insert on public.interviews;
drop policy interviews_update on public.interviews;
create policy interviews_insert on public.interviews for insert to authenticated
  with check (app.can_manage_interviews_for(application_id));
create policy interviews_update on public.interviews for update to authenticated
  using (app.can_manage_interviews_for(application_id))
  with check (app.can_manage_interviews_for(application_id));

drop policy participants_insert on public.interview_participants;
drop policy participants_update on public.interview_participants;
drop policy participants_delete on public.interview_participants;
create policy participants_insert on public.interview_participants for insert to authenticated
  with check (app.can_manage_interview(interview_id));
create policy participants_update on public.interview_participants for update to authenticated
  using (app.can_manage_interview(interview_id)) with check (app.can_manage_interview(interview_id));
create policy participants_delete on public.interview_participants for delete to authenticated
  using (app.can_manage_interview(interview_id));

alter table public.interviews add column if not exists result_comment text
  check (result_comment is null or length(result_comment) <= 2000);
comment on column public.interviews.result is 'Короткий підсумок (наприклад, «рекомендовано на наступний етап»).';
