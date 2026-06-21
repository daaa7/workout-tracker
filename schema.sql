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

-- In-app feedback (reliable capture — no email client needed).
-- Users can only INSERT their own feedback; nobody can read via the client
-- (you read it in the Supabase dashboard / service role).
create table if not exists public.wo_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  message     text not null,
  created_at  timestamptz not null default now()
);
alter table public.wo_feedback enable row level security;
create policy "wo_feedback_insert_own" on public.wo_feedback
  for insert to authenticated with check (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- TackT Pro — entitlement framework (scaffold)
--
-- Source of truth for who has Pro. The client can ONLY READ its own row;
-- it can never grant itself Pro. You set tier from the dashboard (service
-- role) today, and a Stripe webhook (service role) flips it later.
--
-- Hard rule: Pro gates NET-NEW features only. Everything shipped today
-- (year heatmap, personal records, stats, calendar…) stays free forever —
-- see the landing-page promise. The app never gates these.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.wo_entitlements (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tier        text not null default 'free',    -- free | pro
  status      text not null default 'active',  -- active | canceled | past_due
  source      text default 'manual',           -- manual | comp | stripe
  expires_at  timestamptz,                      -- null = no expiry (lifetime / comp)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.wo_entitlements enable row level security;

-- Read-own ONLY. No client insert/update/delete policy on purpose —
-- tier changes go through the service role (dashboard or Stripe webhook).
create policy "wo_entitlements_read_own" on public.wo_entitlements
  for select using (auth.uid() = user_id);

-- → Grant yourself / a tester Pro (run in SQL editor; service role bypasses RLS):
--   insert into public.wo_entitlements (user_id, tier, source)
--   values ('<USER-UUID>', 'pro', 'comp')
--   on conflict (user_id) do update
--     set tier='pro', status='active', source='comp', updated_at=now();
-- Find a UUID: select id, email from auth.users order by created_at desc;

-- "Notify me when Pro lands" — interest signal from the paywall (insert-only,
-- like feedback). Lets you see demand before any payment plumbing is real.
create table if not exists public.wo_pro_interest (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  feature     text,
  created_at  timestamptz not null default now()
);
alter table public.wo_pro_interest enable row level security;
create policy "wo_pro_interest_insert_own" on public.wo_pro_interest
  for insert to authenticated with check (auth.uid() = user_id);
