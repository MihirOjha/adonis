-- Adonis — Row-Level Security policies + signup trigger
-- Run after 0001_init.sql.
--
-- Model: a user (and any Muse token acting as that user via auth.uid()) may
-- only read/write their own rows. Sharing grants read-only access to accepted
-- viewers for the scopes they were granted. Shared recipes are readable by any
-- authenticated user (they're meal templates, not sensitive data).

-- ---------------------------------------------------------------------------
-- Helper: does the current user have an accepted share for owner+scope?
-- ---------------------------------------------------------------------------
create or replace function has_share(target_owner uuid, scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from share_permissions sp
    where sp.owner_id = target_owner
      and sp.viewer_id = auth.uid()
      and sp.status = 'accepted'
      and scope = any (sp.scopes)
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Enable RLS on every user table.
-- ---------------------------------------------------------------------------
alter table profiles           enable row level security;
alter table cycles             enable row level security;
alter table foods              enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table daily_logs         enable row level security;
alter table food_entries       enable row level security;
alter table exercises          enable row level security;
alter table workout_sessions   enable row level security;
alter table exercise_sets      enable row level security;
alter table body_metrics       enable row level security;
alter table coach_targets      enable row level security;
alter table inbox_notes        enable row level security;
alter table share_permissions  enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_own_or_shared" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from share_permissions sp
      where sp.owner_id = profiles.id
        and sp.viewer_id = auth.uid()
        and sp.status = 'accepted'
    )
  );
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Generic owner-only tables (owner = user_id)
-- ---------------------------------------------------------------------------
-- cycles
create policy "cycles_owner_all" on cycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- foods
create policy "foods_owner_all" on foods
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- exercises
create policy "exercises_owner_all" on exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- inbox_notes
create policy "inbox_owner_all" on inbox_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- coach_targets: readable by owner or a viewer granted the 'food' scope
create policy "coach_targets_select" on coach_targets
  for select using (
    user_id = auth.uid() or has_share(user_id, 'food')
  );
create policy "coach_targets_write" on coach_targets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- body_metrics: readable by owner or viewer with 'weight'/'photos' scope
create policy "body_metrics_select" on body_metrics
  for select using (
    user_id = auth.uid()
    or has_share(user_id, 'weight')
    or (photo_url is not null and has_share(user_id, 'photos'))
  );
create policy "body_metrics_write" on body_metrics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- daily_logs: readable by owner or viewer with 'food'/'workouts' scope
create policy "daily_logs_select" on daily_logs
  for select using (
    user_id = auth.uid()
    or has_share(user_id, 'food')
    or has_share(user_id, 'workouts')
  );
create policy "daily_logs_write" on daily_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- recipes: owner full access; shared recipes readable by any authed user
-- ---------------------------------------------------------------------------
create policy "recipes_select" on recipes
  for select using (
    user_id = auth.uid() or visibility = 'shared'
  );
create policy "recipes_write" on recipes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recipe_ingredients_select" on recipe_ingredients
  for select using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id
        and (r.user_id = auth.uid() or r.visibility = 'shared')
    )
  );
create policy "recipe_ingredients_write" on recipe_ingredients
  for all using (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Child tables scoped through their parent daily_log / session
-- ---------------------------------------------------------------------------
create policy "food_entries_select" on food_entries
  for select using (
    exists (
      select 1 from daily_logs d
      where d.id = food_entries.daily_log_id
        and (d.user_id = auth.uid() or has_share(d.user_id, 'food'))
    )
  );
create policy "food_entries_write" on food_entries
  for all using (
    exists (
      select 1 from daily_logs d
      where d.id = food_entries.daily_log_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from daily_logs d
      where d.id = food_entries.daily_log_id and d.user_id = auth.uid()
    )
  );

create policy "workout_sessions_select" on workout_sessions
  for select using (
    exists (
      select 1 from daily_logs d
      where d.id = workout_sessions.daily_log_id
        and (d.user_id = auth.uid() or has_share(d.user_id, 'workouts'))
    )
  );
create policy "workout_sessions_write" on workout_sessions
  for all using (
    exists (
      select 1 from daily_logs d
      where d.id = workout_sessions.daily_log_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from daily_logs d
      where d.id = workout_sessions.daily_log_id and d.user_id = auth.uid()
    )
  );

create policy "exercise_sets_select" on exercise_sets
  for select using (
    exists (
      select 1 from workout_sessions ws
      join daily_logs d on d.id = ws.daily_log_id
      where ws.id = exercise_sets.session_id
        and (d.user_id = auth.uid() or has_share(d.user_id, 'workouts'))
    )
  );
create policy "exercise_sets_write" on exercise_sets
  for all using (
    exists (
      select 1 from workout_sessions ws
      join daily_logs d on d.id = ws.daily_log_id
      where ws.id = exercise_sets.session_id and d.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_sessions ws
      join daily_logs d on d.id = ws.daily_log_id
      where ws.id = exercise_sets.session_id and d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- share_permissions: owner manages; either party can read; viewer may accept
-- ---------------------------------------------------------------------------
create policy "share_select_involved" on share_permissions
  for select using (owner_id = auth.uid() or viewer_id = auth.uid());
create policy "share_insert_owner" on share_permissions
  for insert with check (owner_id = auth.uid());
create policy "share_update_involved" on share_permissions
  for update using (owner_id = auth.uid() or viewer_id = auth.uid())
  with check (owner_id = auth.uid() or viewer_id = auth.uid());
create policy "share_delete_owner" on share_permissions
  for delete using (owner_id = auth.uid());
