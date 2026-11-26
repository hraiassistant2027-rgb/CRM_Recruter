-- Підготовка робочого місця IT: прізвище та ім'я латиницею (для облікових записів, пошти тощо)
alter table public.it_requests
  add column if not exists name_latin text check (name_latin is null or length(name_latin) <= 200);
