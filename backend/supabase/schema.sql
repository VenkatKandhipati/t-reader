-- Kathalu schema. Run once in Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS where possible.

create extension if not exists "pgcrypto";

create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  telugu        text not null,
  trans         text,
  meaning       text,
  story_idx     int,
  interval      int not null default 0,
  ease_factor   real not null default 2.5,
  repetitions   int not null default 0,
  next_review   date not null default current_date,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, telugu)
);

create index if not exists cards_user_next_review_idx
  on public.cards (user_id, next_review);

create table if not exists public.reviews (
  id            bigserial primary key,
  card_id       uuid not null references public.cards(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  quality       smallint not null check (quality between 0 and 5),
  reviewed_at   timestamptz not null default now()
);

create index if not exists reviews_user_time_idx
  on public.reviews (user_id, reviewed_at desc);

create table if not exists public.story_progress (
  user_id       uuid not null references auth.users(id) on delete cascade,
  story_idx     int not null,
  best_pct      int not null default 0 check (best_pct between 0 and 100),
  last_read_at  timestamptz not null default now(),
  primary key (user_id, story_idx)
);

create table if not exists public.reading_days (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  primary key (user_id, day)
);

create index if not exists reading_days_user_day_idx
  on public.reading_days (user_id, day desc);

create table if not exists public.reading_sessions (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  story_idx     int not null,
  started_at    timestamptz not null default now(),
  pct           int
);

create index if not exists reading_sessions_user_time_idx
  on public.reading_sessions (user_id, started_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cards_touch_updated_at on public.cards;
create trigger cards_touch_updated_at
  before update on public.cards
  for each row execute function public.touch_updated_at();

-- RLS is optional here because the FastAPI service talks to Postgres using
-- the service_role connection (bypasses RLS) and enforces access by user_id
-- in each query. Enable RLS if you ever expose tables directly to supabase-js.
