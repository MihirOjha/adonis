-- Adonis — Muse <-> dev async message channel
-- Run after 0003_muse_tokens.sql.
--
-- A shared message board both Muse (via its scoped token) and the user/dev can
-- read and write. This is the "shared doc" for capability requests, feedback,
-- suggestions, and questions — without giving Muse git/repo access.
-- RLS scopes every row to the owning user.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type message_author as enum ('muse', 'dev', 'user');
create type message_kind as enum (
  'capability_request',  -- Muse needs something it can't do yet
  'feedback',            -- Muse's observations / results
  'suggestion',          -- proposed improvement
  'question',            -- a question for the dev/user
  'note'                 -- general message
);
create type message_status as enum ('open', 'acknowledged', 'done', 'dismissed');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists muse_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  author      message_author not null,
  kind        message_kind not null default 'note',
  body        text not null,
  status      message_status not null default 'open',
  created_at  timestamptz not null default now()
);

create index if not exists muse_messages_user_id_idx on muse_messages (user_id);
create index if not exists muse_messages_created_idx on muse_messages (user_id, created_at desc);

alter table muse_messages enable row level security;

-- A user (and their Muse token, acting as that user) can read/write their own.
drop policy if exists "muse_messages_select_own" on muse_messages;
create policy "muse_messages_select_own" on muse_messages
  for select using (auth.uid() = user_id);
drop policy if exists "muse_messages_insert_own" on muse_messages;
create policy "muse_messages_insert_own" on muse_messages
  for insert with check (auth.uid() = user_id);
drop policy if exists "muse_messages_update_own" on muse_messages;
create policy "muse_messages_update_own" on muse_messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
