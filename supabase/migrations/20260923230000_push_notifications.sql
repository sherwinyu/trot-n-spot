-- Push notifications: per-device tokens, a per-user mute, and pack
-- activity events.
--
-- profiles.push_token held one token per user, so every sign-in on a
-- second device silently stole delivery from the first. push_tokens
-- keeps one row per device; the edge function fans out to all of them
-- and deletes rows Expo reports as DeviceNotRegistered.
--
-- profiles.push_enabled is the in-app mute. Tokens stay registered while
-- it is off so turning it back on needs no permission round-trip.
--
-- The quests trigger is generalised to notify_push_event() and also
-- attached to pack_members, so joining a pack pings the existing
-- members. Recipient policy lives in the edge function; the trigger
-- only forwards Supabase-webhook-shaped payloads.

-- pg_net is what lets the trigger call the edge function. Hosted
-- projects don't have it enabled by default; plain Postgres (the local
-- test harness) doesn't ship it at all, so tolerate its absence.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise warning 'pg_net unavailable (%); push dispatch will no-op', sqlerrm;
end $$;

-- ============ push_tokens ============

create table push_tokens (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on push_tokens(user_id);

create trigger push_tokens_updated_at
  before update on push_tokens
  for each row execute function update_updated_at();

alter table push_tokens enable row level security;

create policy "Users manage own push tokens"
  on push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

insert into push_tokens (token, user_id)
select push_token, id from profiles where push_token is not null;

alter table profiles drop column push_token;
alter table profiles add column push_enabled boolean not null default true;

-- ============ dispatch trigger ============

drop trigger if exists quests_notify_push on quests;
drop function if exists notify_quest_change();

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
  if tg_table_name = 'quests' and tg_op = 'UPDATE'
     and (new.status != 'completed' or old.status = 'completed') then
    return new;
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

create trigger quests_notify_push
  after insert or update on quests
  for each row execute function notify_push_event();

create trigger pack_members_notify_push
  after insert on pack_members
  for each row execute function notify_push_event();
