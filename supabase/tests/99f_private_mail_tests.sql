-- Листування приватне: лише своя скринька; чуже — тільки Супер адміністратор
\set QUIET on
set client_min_messages = notice;
\echo '--- 35. Приватне листування'
insert into public.candidates (id, full_name, owner_id, created_by)
values ('99f00000-0000-0000-0000-000000000001', 'Кандидат Листування', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
insert into public.email_accounts (id, user_id, google_email, status)
values ('99f00000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'rec1@gmail.test', 'active')
on conflict (user_id) do nothing;
insert into public.email_messages (candidate_id, direction, status, subject, sent_by) values
  ('99f00000-0000-0000-0000-000000000001', 'out', 'sent', 'Лист від рекрутера 1', '00000000-0000-0000-0000-0000000000a2');
insert into public.email_messages (candidate_id, direction, status, subject, account_id, sent_by) values
  ('99f00000-0000-0000-0000-000000000001', 'in', 'received', 'Відповідь кандидата',
   (select id from public.email_accounts where user_id = '00000000-0000-0000-0000-0000000000a2'), null);

set role authenticated;
select tst.login('00000000-0000-0000-0000-0000000000a2');
select tst.ok((select count(*) from public.email_messages where candidate_id = '99f00000-0000-0000-0000-000000000001') = 2,
              'власник бачить свої надіслані й отримані листи');
select tst.login('00000000-0000-0000-0000-0000000000a3');
select tst.ok((select count(*) from public.email_messages where candidate_id = '99f00000-0000-0000-0000-000000000001') = 0,
              'інший рекрутер чужого листування не бачить');
select tst.login('00000000-0000-0000-0000-0000000000a1', 'aal2');
select tst.ok((select count(*) from public.email_messages where candidate_id = '99f00000-0000-0000-0000-000000000001') = 2,
              'Супер адміністратор бачить усе листування');
reset role;
delete from public.email_messages where candidate_id = '99f00000-0000-0000-0000-000000000001';
delete from public.email_accounts where id = '99f00000-0000-0000-0000-0000000000e2';
delete from public.candidates where id = '99f00000-0000-0000-0000-000000000001';
\echo '=== Тести приватного листування пройдено ==='
