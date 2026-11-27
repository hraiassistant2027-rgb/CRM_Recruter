-- Нотатки до конкретної зустрічі в календарі (вони ж видно в картці кандидата)
alter table public.notes add column interview_id uuid references public.interviews(id) on delete set null;
create index ix_notes_interview on public.notes (interview_id) where interview_id is not null;
