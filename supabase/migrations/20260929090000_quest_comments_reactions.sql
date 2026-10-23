-- Quest comments and reactions (SHE-164).
--
-- Packmates can leave a flat comment thread and fixed-set reactions on any
-- quest in their pack. Together with the quest's own lifecycle
-- (created_at, completed_at) these form the per-quest activity timeline
-- rendered on the quest detail screen.
--
-- New comments also dispatch through notify_push_event(), so quest
-- participants get a push + an Activity feed row (type quest_commented).
-- Reactions are deliberately silent.

-- ============ quest_comments ============

create table quest_comments (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references quests(id) on delete cascade,
  -- Copied from the quest by trigger (never trusted from the client) so RLS
  -- and the push payload don't need a join.
  pack_id uuid not null references packs(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index quest_comments_quest_id_idx on quest_comments(quest_id, created_at);

create or replace function set_quest_comment_pack_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select pack_id into new.pack_id from quests where id = new.quest_id;
  return new;
end;
$$;

create trigger quest_comments_set_pack_id
  before insert on quest_comments
  for each row execute function set_quest_comment_pack_id();

alter table quest_comments enable row level security;

create policy "Pack members read quest comments"
  on quest_comments for select
  using (is_pack_member(pack_id, auth.uid()));

create policy "Pack members comment as themselves"
  on quest_comments for insert
  with check (author_id = auth.uid() and is_pack_member(pack_id, auth.uid()));

create policy "Authors delete own comments"
  on quest_comments for delete
  using (author_id = auth.uid());

grant select, insert, delete on public.quest_comments to authenticated;

-- Same dispatcher as 20260923230000, but the quests-only status check is
-- nested: plpgsql resolves every field in a condition, and quest_comments
-- has no status column.
create or replace function notify_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_url text;
  webhook_token text;
begin
  select value into webhook_url from app_config where key = 'push_webhook_url';
  select value into webhook_token from app_config where key = 'push_webhook_token';

  if webhook_url is null then
    return new;
  end if;

  -- Quest updates only matter on the transition to completed.
  if tg_table_name = 'quests' and tg_op = 'UPDATE' then
    if new.status != 'completed' or old.status = 'completed' then
      return new;
    end if;
  end if;

  begin
    perform net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(webhook_token, '')
      ),
      body := jsonb_build_object(
        'type', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', to_jsonb(new),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
      )
    );
  exception when others then
    -- pg_net missing or request queueing failed; never block the write.
    raise warning 'push notification dispatch failed: %', sqlerrm;
  end;

  return new;
end;
$$;

create trigger quest_comments_notify_push
  after insert on quest_comments
  for each row execute function notify_push_event();

-- ============ quest_reactions ============

create table quest_reactions (
  quest_id uuid not null references quests(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('love', 'laugh', 'wow', 'paw', 'fire')),
  created_at timestamptz not null default now(),
  primary key (quest_id, user_id, kind)
);

alter table quest_reactions enable row level security;

-- The quests select policy already scopes the subquery to the caller's packs.
create policy "Pack members read quest reactions"
  on quest_reactions for select
  using (exists (select 1 from quests q where q.id = quest_id and is_pack_member(q.pack_id, auth.uid())));

create policy "Pack members react as themselves"
  on quest_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from quests q where q.id = quest_id and is_pack_member(q.pack_id, auth.uid()))
  );

create policy "Users remove own reactions"
  on quest_reactions for delete
  using (user_id = auth.uid());

grant select, insert, delete on public.quest_reactions to authenticated;

-- ============ activity feed ============

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('quest_created', 'quest_completed', 'quest_commented', 'pack_joined'));
