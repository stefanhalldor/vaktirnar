-- Migration 001: Create shared waitlist table
-- Notuð af öllum Vaktirnar vörum

create table if not exists waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  product     text not null,  -- 'krakkavaktin' | 'thridjavaktin' | 'sjoppuvaktin'
  locale      text not null default 'is',
  created_at  timestamptz not null default now(),

  constraint waitlist_email_product_unique unique (email, product)
);

-- RLS
alter table waitlist enable row level security;

-- Allir geta skráð sig (insert)
create policy "Anyone can join waitlist"
  on waitlist for insert
  with check (true);

-- Enginn getur lesið lista annarra (select er bara fyrir service role)
create policy "No public reads"
  on waitlist for select
  using (false);
