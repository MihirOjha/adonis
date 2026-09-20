-- Adonis — scoped Muse API tokens
-- Run after 0002_rls.sql.
--
-- Each row is a long-lived, revocable credential that lets a Muse account act
-- as ONE user against the `muse` edge function. The token itself is shown to
-- the user once at creation; we store only a SHA-256 hash. The edge function
-- hashes the incoming bearer token and looks it up here, then runs all queries
-- as that user so Row-Level Security still scopes every read/write to that
-- single user's rows. Muse can never touch another user's data.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists muse_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null default 'Muse',
  token_hash  text not null unique,        -- sha256 hex of the bearer token
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz                  -- null = active
);

create index if not exists muse_tokens_user_id_idx on muse_tokens (user_id);
create index if not exists muse_tokens_hash_idx on muse_tokens (token_hash) where revoked_at is null;

alter table muse_tokens enable row level security;

-- A user manages only their own tokens (create / list / revoke).
drop policy if exists "muse_tokens_select_own" on muse_tokens;
create policy "muse_tokens_select_own" on muse_tokens
  for select using (auth.uid() = user_id);
drop policy if exists "muse_tokens_insert_own" on muse_tokens;
create policy "muse_tokens_insert_own" on muse_tokens
  for insert with check (auth.uid() = user_id);
drop policy if exists "muse_tokens_update_own" on muse_tokens;
create policy "muse_tokens_update_own" on muse_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "muse_tokens_delete_own" on muse_tokens;
create policy "muse_tokens_delete_own" on muse_tokens
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Resolve a bearer token to a user id.
-- Security definer so the edge function (running as the anon key, before a
-- user JWT exists) can look up the token. Returns null for unknown/revoked.
-- ---------------------------------------------------------------------------
create or replace function resolve_muse_token(token text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select user_id
  from muse_tokens
  where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    and revoked_at is null
  limit 1;
$$;

-- Touch last_used_at when a token is used (best-effort, security definer).
create or replace function touch_muse_token(token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update muse_tokens
  set last_used_at = now()
  where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
    and revoked_at is null;
$$;
