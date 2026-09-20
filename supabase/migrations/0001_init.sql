-- Adonis — initial schema
-- Postgres (Supabase). Run in the Supabase SQL editor or via `supabase db push`.
--
-- Design notes:
--  * Every user-owned table carries user_id and is protected by Row-Level
--    Security so a user (and their scoped Muse token) can only ever see or
--    modify their own rows.
--  * Sharing is opt-in via share_permissions + a helper that grants read-only
--    visibility for specific scopes.
--  * Enums keep the domain values consistent with src/domain/types.ts.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type sex as enum ('male', 'female');
create type goal as enum ('cut', 'maintain', 'bulk', 'recomp');
create type activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type food_source as enum ('barcode', 'usda', 'manual');
create type recipe_visibility as enum ('private', 'shared');
create type inbox_status as enum ('pending', 'processed', 'discarded');
create type cycle_status as enum ('active', 'completed', 'abandoned');
create type target_setter as enum ('muse', 'manual');
create type share_status as enum ('pending', 'accepted', 'revoked');
create type metric_source as enum ('health', 'manual');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null default '',
  sex          sex,
  birthdate    date,
  height_cm    numeric(5, 1),
  activity     activity_level not null default 'moderate',
  goal         goal not null default 'maintain',
  muse_account_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cycles (goal periods; replace a fixed program)
-- ---------------------------------------------------------------------------
create table cycles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  name        text not null,
  goal        goal not null,
  start_date  date not null default current_date,
  target_date date,
  status      cycle_status not null default 'active',
  created_at  timestamptz not null default now()
);
create index cycles_user_idx on cycles (user_id, status);

-- ---------------------------------------------------------------------------
-- Foods (verified personal database; deduped)
-- ---------------------------------------------------------------------------
create table foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  name        text not null,
  source      food_source not null default 'manual',
  barcode     text,
  -- Per 100 g:
  calories    numeric(7, 2) not null,
  protein     numeric(7, 2) not null default 0,
  carbs       numeric(7, 2) not null default 0,
  fat         numeric(7, 2) not null default 0,
  fiber       numeric(7, 2),
  sodium      numeric(7, 2),
  iron        numeric(7, 2),
  calcium     numeric(7, 2),
  vitamin_d   numeric(7, 2),
  created_at  timestamptz not null default now()
);
create index foods_user_idx on foods (user_id);
create index foods_barcode_idx on foods (user_id, barcode);

-- ---------------------------------------------------------------------------
-- Recipes + ingredients (bulk-cook portioning)
-- ---------------------------------------------------------------------------
create table recipes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  name           text not null,
  cooked_weight_g numeric(8, 1) not null check (cooked_weight_g > 0),
  visibility     recipe_visibility not null default 'private',
  -- Derived totals (kept for quick reads; recomputed on ingredient change):
  total_calories numeric(9, 2) not null default 0,
  total_protein  numeric(9, 2) not null default 0,
  total_carbs    numeric(9, 2) not null default 0,
  total_fat      numeric(9, 2) not null default 0,
  created_at     timestamptz not null default now()
);
create index recipes_user_idx on recipes (user_id);
create index recipes_shared_idx on recipes (visibility);

create table recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes (id) on delete cascade,
  food_id    uuid references foods (id) on delete set null,
  name       text not null,
  raw_grams  numeric(8, 1) not null check (raw_grams > 0),
  -- snapshot of per-100g at time of adding (so recipe stays stable):
  calories   numeric(7, 2) not null,
  protein    numeric(7, 2) not null default 0,
  carbs      numeric(7, 2) not null default 0,
  fat        numeric(7, 2) not null default 0
);
create index recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------------
-- Daily logs + food entries
-- ---------------------------------------------------------------------------
create table daily_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles (id) on delete cascade,
  log_date  date not null,
  notes     text,
  unique (user_id, log_date)
);
create index daily_logs_user_date_idx on daily_logs (user_id, log_date);

create table food_entries (
  id           uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references daily_logs (id) on delete cascade,
  food_id      uuid references foods (id) on delete set null,
  recipe_id    uuid references recipes (id) on delete set null,
  meal         meal_slot not null default 'snack',
  grams        numeric(8, 1) not null check (grams > 0),
  -- snapshot of computed nutrition for this entry:
  calories     numeric(8, 2) not null,
  protein      numeric(8, 2) not null default 0,
  carbs        numeric(8, 2) not null default 0,
  fat          numeric(8, 2) not null default 0,
  created_at   timestamptz not null default now()
);
create index food_entries_log_idx on food_entries (daily_log_id);

-- ---------------------------------------------------------------------------
-- Exercise
-- ---------------------------------------------------------------------------
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  name         text not null,
  type         text not null default 'strength',
  muscle_group text
);
create index exercises_user_idx on exercises (user_id);

create table workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references daily_logs (id) on delete cascade,
  name         text not null default 'Workout',
  duration_min integer,
  created_at   timestamptz not null default now()
);
create index workout_sessions_log_idx on workout_sessions (daily_log_id);

create table exercise_sets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references workout_sessions (id) on delete cascade,
  exercise_id uuid references exercises (id) on delete set null,
  reps        integer,
  weight_kg   numeric(6, 2),
  rest_sec    integer,
  position    integer not null default 0
);
create index exercise_sets_session_idx on exercise_sets (session_id);

-- ---------------------------------------------------------------------------
-- Body metrics
-- ---------------------------------------------------------------------------
create table body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  metric_date date not null,
  weight_kg   numeric(6, 2),
  body_fat    numeric(5, 2),
  waist_cm    numeric(6, 2),
  chest_cm    numeric(6, 2),
  photo_url   text,
  source      metric_source not null default 'manual',
  created_at  timestamptz not null default now(),
  unique (user_id, metric_date, source)
);
create index body_metrics_user_date_idx on body_metrics (user_id, metric_date);

-- ---------------------------------------------------------------------------
-- Coach targets (adaptive; written by Muse or the user)
-- ---------------------------------------------------------------------------
create table coach_targets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  cycle_id       uuid references cycles (id) on delete set null,
  effective_date date not null default current_date,
  calories       integer not null,
  protein        integer not null,
  carbs          integer not null,
  fat            integer not null,
  expenditure    integer,
  rationale      text,
  set_by         target_setter not null default 'muse',
  created_at     timestamptz not null default now()
);
create index coach_targets_user_date_idx on coach_targets (user_id, effective_date desc);

-- ---------------------------------------------------------------------------
-- Muse Inbox (messy notes → structured entries)
-- ---------------------------------------------------------------------------
create table inbox_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  raw_text   text not null,
  status     inbox_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index inbox_notes_user_idx on inbox_notes (user_id, status);

-- ---------------------------------------------------------------------------
-- Sharing (invitation + granular scopes, "Find My" model)
-- ---------------------------------------------------------------------------
create table share_permissions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles (id) on delete cascade,
  viewer_id  uuid not null references profiles (id) on delete cascade,
  scopes     text[] not null default '{}',
  status     share_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_id)
);
create index share_permissions_viewer_idx on share_permissions (viewer_id, status);
