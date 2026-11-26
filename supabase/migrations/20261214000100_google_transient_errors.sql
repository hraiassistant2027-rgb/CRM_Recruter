-- Тимчасові збої Google (internal_failure тощо) більше не вимикають підключення.
-- Повертаємо в роботу акаунти, які раніше помилково позначено як 'error'.
update public.email_accounts
   set status = 'active', last_error = null
 where status = 'error' and refresh_token_encrypted is not null;
