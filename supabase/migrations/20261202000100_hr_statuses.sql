-- =====================================================================
-- Кадровики: кілька людей можуть мати спільну скриньку; статуси оформлення кандидата
-- =====================================================================
alter table public.hr_contacts drop constraint if exists hr_contacts_email_key;

insert into public.hr_contacts (name, email)
select v.name, v.email
from (values ('Ліза', 'a.v.usataya@gmail.com'), ('Юлія В.', 'a.v.usataya@gmail.com'), ('Тетяна Т.', 'a.v.usataya@gmail.com')) as v(name, email)
where not exists (select 1 from public.hr_contacts h where h.name = v.name);

-- Статуси підготовки до оформлення (етап «Офер»)
alter table public.applications
  add column if not exists hr_docs_status text not null default 'pending' check (hr_docs_status in ('pending', 'passed')),
  add column if not exists hr_approval_status text not null default 'pending' check (hr_approval_status in ('pending', 'signed'));
comment on column public.applications.hr_docs_status is 'Перевірка документів: pending — очікую, passed — пройдено.';
comment on column public.applications.hr_approval_status is 'Лист погодження: pending — очікую підписання, signed — підписано.';
