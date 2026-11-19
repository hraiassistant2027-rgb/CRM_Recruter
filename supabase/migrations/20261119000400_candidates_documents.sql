-- =====================================================================
-- 0004. Кандидати, резюме, імпорт, згоди
-- =====================================================================

create table public.candidates (
  id                       uuid primary key default gen_random_uuid(),
  full_name                text not null check (length(trim(full_name)) > 0),
  phone                    text,
  phone_e164               text generated always as (app.normalize_phone(phone)) stored,
  email                    text,
  email_norm               text generated always as (nullif(lower(trim(email)), '')) stored,
  city                     text,
  linkedin_url             text,
  linkedin_norm            text generated always as (app.normalize_linkedin(linkedin_url)) stored,
  source_id                uuid references public.sources(id),
  current_position         text,
  total_experience_months  int check (total_experience_months is null or total_experience_months >= 0),
  desired_salary           numeric(12,2) check (desired_salary is null or desired_salary >= 0),
  salary_currency          char(3) not null default 'UAH',
  available_from           date,
  skills                   text[] not null default '{}',
  summary                  text,
  owner_id                 uuid references public.profiles(id) default auth.uid(),
  review_status            text not null default 'reviewed'
                           check (review_status in ('reviewed', 'unreviewed')),
  merged_into_id           uuid references public.candidates(id),
  custom                   jsonb not null default '{}' check (jsonb_typeof(custom) = 'object'),
  search_tsv               tsvector,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.profiles(id) default auth.uid(),
  deleted_at               timestamptz,
  deleted_by               uuid references public.profiles(id)
);
comment on table public.candidates is 'Єдина картка кандидата. Відгуки на вакансії — окремо, у applications.';
comment on column public.candidates.review_status is 'unreviewed = створено автоматично під час імпорту архіву, ще не перевірено рекрутером.';
comment on column public.candidates.deleted_at is 'М''яке видалення (кошик). Фізичне видалення — лише функцією стирання персональних даних.';

create index ix_candidates_phone     on public.candidates (phone_e164)   where deleted_at is null;
create index ix_candidates_email     on public.candidates (email_norm)   where deleted_at is null;
create index ix_candidates_linkedin  on public.candidates (linkedin_norm) where deleted_at is null;
create index ix_candidates_owner     on public.candidates (owner_id);
create index ix_candidates_search    on public.candidates using gin (search_tsv);
create index ix_candidates_name_trgm on public.candidates
  using gin (app.search_text(full_name) extensions.gin_trgm_ops);
create index ix_candidates_skills    on public.candidates using gin (skills);
create index ix_candidates_custom    on public.candidates using gin (custom jsonb_path_ops);

create or replace function app.candidates_search_tsv()
returns trigger language plpgsql as $$
begin
  new.search_tsv :=
       setweight(to_tsvector('simple', app.search_text(new.full_name)), 'A')
    || setweight(to_tsvector('simple', app.search_text(new.current_position)), 'B')
    || setweight(to_tsvector('simple', app.search_text(array_to_string(new.skills, ' '))), 'B')
    || setweight(to_tsvector('simple', app.search_text(new.city)), 'C')
    || setweight(to_tsvector('simple', app.search_text(new.summary)), 'D');
  return new;
end $$;

create trigger trg_candidates_tsv before insert or update of full_name, current_position, skills, city, summary
  on public.candidates for each row execute function app.candidates_search_tsv();
create trigger trg_candidates_updated before update on public.candidates
  for each row execute function app.set_updated_at();

create table public.candidate_experience (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  company       text,
  position      text,
  start_date    date,
  end_date      date,
  description   text,
  sort_order    int not null default 0,
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index ix_experience_candidate on public.candidate_experience (candidate_id);

create table public.candidate_education (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  institution   text,
  degree        text,
  speciality    text,
  year_end      int check (year_end is null or year_end between 1950 and 2100),
  sort_order    int not null default 0
);
create index ix_education_candidate on public.candidate_education (candidate_id);

create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  legal_basis   text not null check (legal_basis in ('consent', 'pre_contract', 'legitimate_interest')),
  source        text not null,
  given_at      timestamptz not null default now(),
  expires_at    timestamptz,
  withdrawn_at  timestamptz,
  created_by    uuid references public.profiles(id) default auth.uid()
);
create index ix_consents_candidate on public.consents (candidate_id);

-- ---------------------------------------------------------------------
-- Імпорт і файли резюме (самі файли — у сховищі, тут лише метадані)
-- ---------------------------------------------------------------------
create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  mode             text not null default 'regular' check (mode in ('regular', 'archive')),
  uploaded_by      uuid not null references public.profiles(id) default auth.uid(),
  file_count       int not null default 0,
  processed_count  int not null default 0,
  failed_count     int not null default 0,
  status           text not null default 'uploading'
                   check (status in ('uploading', 'processing', 'review', 'done', 'failed', 'cancelled')),
  notes            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid references public.candidates(id) on delete cascade,
  batch_id        uuid references public.import_batches(id) on delete set null,
  storage_bucket  text not null default 'resumes',
  storage_path    text not null unique,
  original_name   text not null,
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  extracted_text  text,
  text_tsv        tsvector generated always as
                  (to_tsvector('simple'::regconfig, app.search_text(left(extracted_text, 200000)))) stored,
  parse_status    text not null default 'pending'
                  check (parse_status in ('pending', 'extracting', 'parsing', 'parsed', 'indexed_only', 'failed', 'skipped_duplicate')),
  parse_error     text,
  uploaded_by     uuid references public.profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
comment on column public.documents.parse_status is 'indexed_only = економний режим для старого архіву: текст для пошуку без AI-розпізнавання.';
create unique index ux_documents_sha256 on public.documents (sha256) where deleted_at is null;
create index ix_documents_candidate on public.documents (candidate_id);
create index ix_documents_batch     on public.documents (batch_id);
create index ix_documents_text      on public.documents using gin (text_tsv);
create trigger trg_documents_updated before update on public.documents
  for each row execute function app.set_updated_at();

create table public.parse_results (
  id                    uuid primary key default gen_random_uuid(),
  document_id           uuid not null unique references public.documents(id) on delete cascade,
  model                 text,
  raw_json              jsonb,
  extracted             jsonb not null default '{}',
  confidence            numeric(4,3) check (confidence is null or confidence between 0 and 1),
  duplicate_candidates  jsonb not null default '[]',
  review_status         text not null default 'pending'
                        check (review_status in ('pending', 'auto_accepted', 'approved', 'rejected', 'merged')),
  reviewed_by           uuid references public.profiles(id),
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now()
);
create index ix_parse_results_review on public.parse_results (review_status) where review_status = 'pending';
