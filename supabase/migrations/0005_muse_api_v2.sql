-- Adonis — Muse API v2 (food identity, workouts, corrections) + theme color
-- Run after 0004_muse_messages.sql. Implements dev/muse-v2-spec.md with the
-- hardening from Appendix C (Copilot's red-team review).

-- ---------------------------------------------------------------------------
-- Food entries: free-text name for manual/unlinked entries (spec Change 1)
-- ---------------------------------------------------------------------------
alter table food_entries
  add column if not exists name text;

-- ---------------------------------------------------------------------------
-- Exercise sets: intensity + pain signals (spec Change 2)
-- ---------------------------------------------------------------------------
alter table exercise_sets
  add column if not exists rir smallint check (rir between 0 and 10),
  add column if not exists pain boolean not null default false,
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- Exercise dedup (Appendix C2): prevent "DB Bench" vs "db bench" dupes.
-- One exercise per (user, normalized name).
-- ---------------------------------------------------------------------------
create unique index if not exists exercises_user_name_unique
  on exercises (user_id, lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- Profiles: per-user accent/background color (app theming).
-- Hex string like '#4CC2FF'; null = app default theme.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists theme_color text;
