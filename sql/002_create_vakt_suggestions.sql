-- Migration 002: Tillögur um nýjar vaktir
create table if not exists vakt_suggestions (
  id         uuid primary key default gen_random_uuid(),
  suggestion text not null,
  email      text,
  created_at timestamptz not null default now()
);

alter table vakt_suggestions enable row level security;

create policy "Anyone can submit suggestion"
  on vakt_suggestions for insert
  with check (true);

create policy "No public reads"
  on vakt_suggestions for select
  using (false);
