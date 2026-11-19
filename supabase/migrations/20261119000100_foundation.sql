-- =====================================================================
-- 0001. Фундамент: розширення, службова схема app, допоміжні функції
-- =====================================================================
-- Схема app не публікується через API Supabase: тут лише внутрішні функції.

create schema if not exists extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;
-- індекси пошуку обчислюють unaccent/trigram від імені користувача
grant usage on schema extensions to authenticated, service_role;

create schema if not exists app;
grant usage on schema app to authenticated;

-- updated_at для всіх таблиць
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Телефон -> E.164 (орієнтовано на українські номери)
create or replace function app.normalize_phone(p text)
returns text language plpgsql immutable parallel safe as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' or length(d) < 9 then return null; end if;
  if length(d) = 12 and d like '380%' then return '+' || d; end if;
  if length(d) = 11 and d like '80%'  then return '+3' || d; end if;
  if length(d) = 10 and d like '0%'   then return '+38' || d; end if;
  if length(d) = 9                    then return '+380' || d; end if;
  return '+' || d;
end $$;

-- LinkedIn -> "linkedin.com/in/ім'я"
create or replace function app.normalize_linkedin(u text)
returns text language plpgsql immutable parallel safe as $$
declare v text;
begin
  if u is null then return null; end if;
  v := lower(trim(u));
  v := regexp_replace(v, '^https?://', '');
  v := regexp_replace(v, '^(www\.|[a-z]{2}\.)', '');
  v := regexp_replace(v, '[?#].*$', '');
  v := regexp_replace(v, '/+$', '');
  return nullif(v, '');
end $$;

-- unaccent у незмінній обгортці (потрібно для індексів)
create or replace function app.f_unaccent(text)
returns text language sql immutable parallel safe strict as
$$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- Текст для пошуку: нижній регістр + без діакритики
create or replace function app.search_text(text)
returns text language sql immutable parallel safe as
$$ select lower(app.f_unaccent(coalesce($1, ''))) $$;
