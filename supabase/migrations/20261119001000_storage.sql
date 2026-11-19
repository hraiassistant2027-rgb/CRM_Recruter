-- =====================================================================
-- 0010. Приватне сховище резюме (Supabase Storage)
-- =====================================================================
-- Політик для authenticated немає навмисно: файл видає лише сервер,
-- після перевірки прав (app.can_read_document) — підписаним посиланням на 5 хвилин.
-- Кожна видача фіксується в журналі через public.log_event('view_file', ...).

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('resumes', 'resumes', false, 26214400, array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf', 'text/plain',
      'image/jpeg', 'image/png', 'image/tiff',
      'application/zip'
    ])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  else
    raise notice 'Схема storage відсутня (локальний тест) — bucket не створено';
  end if;
end $$;
