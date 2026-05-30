-- ============================================================
--  CHESS TRACKER — Supabase database setup
--  Run this ONCE in your Supabase project:
--    Supabase dashboard  ->  SQL Editor  ->  New query
--    Paste everything below, press RUN.
-- ============================================================

-- Logged chess activities
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  kid         text not null,            -- 'minka' or 'david'
  date        date not null,            -- the day the activity happened
  type        text not null,            -- activity id (e.g. 'game')
  minutes     integer not null,         -- duration in minutes
  created_at  timestamptz not null default now()
);
create index if not exists activities_kid_date_idx on public.activities (kid, date);

-- Reward payout tracking (one row per kid per week)
create table if not exists public.payouts (
  kid         text not null,
  week_start  date not null,            -- the Monday of that week
  paid        boolean not null default false,
  amount      integer not null default 0,
  paid_at     timestamptz,
  primary key (kid, week_start)
);

-- Simple shared key/value settings (e.g. parent PIN)
create table if not exists public.settings (
  key   text primary key,
  value text
);

-- ------------------------------------------------------------
--  Access policies
--  This is a private family app with no login, so we allow the
--  public (anon) key to read & write. Anyone who knows your
--  project URL + anon key could read/write the data, which is
--  fine for a home chess tracker.
-- ------------------------------------------------------------
alter table public.activities enable row level security;
alter table public.payouts    enable row level security;
alter table public.settings   enable row level security;

drop policy if exists "anon all activities" on public.activities;
create policy "anon all activities" on public.activities
  for all to anon using (true) with check (true);

drop policy if exists "anon all payouts" on public.payouts;
create policy "anon all payouts" on public.payouts
  for all to anon using (true) with check (true);

drop policy if exists "anon all settings" on public.settings;
create policy "anon all settings" on public.settings
  for all to anon using (true) with check (true);
