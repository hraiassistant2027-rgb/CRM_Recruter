-- =====================================================================
-- Листування приватне: кожен бачить лише листи своєї скриньки
-- (надіслані ним або отримані на його підключену пошту).
-- Чуже листування бачить тільки Супер адміністратор.
-- =====================================================================
create or replace function app.owns_email_account(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_account is not null and exists (
    select 1 from public.email_accounts a where a.id = p_account and a.user_id = auth.uid())
$$;
revoke execute on function app.owns_email_account(uuid) from public, anon;
grant execute on function app.owns_email_account(uuid) to authenticated, service_role;

drop policy email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages for select to authenticated
  using (
    app.is_super_admin()
    or (app.has_permission('email.read')
        and app.can_read_candidate_id(candidate_id)
        and (sent_by = auth.uid() or app.owns_email_account(account_id)))
  );
