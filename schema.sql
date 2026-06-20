-- ════════════════════════════════════════════════════════════════
-- GROOVE — Workout Tracker schema
-- Run this in the SQL Editor of your dedicated `workout-tracker` project
-- (Supabase dashboard → SQL Editor → New query → paste → Run).
-- ════════════════════════════════════════════════════════════════

-- Abbreviation dictionary: BP -> Bench Press
create table if not exists public.wo_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  abbr        text not null,
  name        text not null,
  category    text default 'other',
  kind        text default 'strength',   -- strength | cardio | activity
  created_at  timestamptz not null default now(),
  unique (user_id, abbr)
);

-- One row per exercise performed per day
create table if not exists public.wo_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  abbr        text,
  exercise    text,
  reps        int  default 0,
  sets        int  default 1,
  weight      numeric,    -- lbs (strength)
  distance    numeric,    -- miles (cardio)
  duration    int,        -- minutes (cardio / activity)
  note        text,
  raw         text,
  created_at  timestamptz not null default now()
);

create index if not exists wo_logs_user_date_idx on public.wo_logs (user_id, date);
create index if not exists wo_exercises_user_idx  on public.wo_exercises (user_id);

-- Row Level Security: each user only ever sees their own rows
alter table public.wo_exercises enable row level security;
alter table public.wo_logs      enable row level security;

create policy "wo_exercises_own" on public.wo_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "wo_logs_own" on public.wo_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
