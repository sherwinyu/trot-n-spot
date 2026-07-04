-- Packs: small trusted circles replacing the hard-coded 1:1 partner model.
--
-- A pack is a named, invite-only group (target size 3-8). A person may
-- belong to several packs. Quests now belong to a pack and come in two
-- modes: 'targeted' (one assignee, today's behavior) or 'open' (anyone
-- in the pack; first to complete wins). Visibility and assignment are
-- separate questions: every quest is visible to the whole pack as a
-- teaser (photo + description, never location); the mode only controls
-- who may complete it.
--
-- Columns marked "reserved" (visibility, status, expires_at, max_uses)
-- carry no behavior yet — they exist so future cross-pack/discovery
-- work is a config change, not a migration.
--
-- Existing mutually-paired couples are migrated into an auto-created
-- two-person pack each, then partner_id/pair_code are dropped.

-- ============ tables ============

create table packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id),
  allow_member_invites boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'discoverable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger packs_updated_at
  before update on packs
  for each row execute function update_updated_at();

create table pack_members (
  pack_id uuid not null references packs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'pending')),
  joined_at timestamptz not null default now(),
  primary key (pack_id, user_id)
);

create table pack_invites (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references packs(id) on delete cascade,
  code text unique not null,
  created_by uuid not null references profiles(id),
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ membership helpers ============
-- SECURITY DEFINER so RLS policies can consult membership without
-- recursing into pack_members' own policies (same trick as 007).

create or replace function is_pack_member(p_pack_id uuid, p_user_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pack_members
    where pack_id = p_pack_id and user_id = p_user_id and status = 'active'
  );
$$;

create or replace function shares_pack_with(p_user_a uuid, p_user_b uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from pack_members a
    join pack_members b using (pack_id)
    where a.user_id = p_user_a and b.user_id = p_user_b
      and a.status = 'active' and b.status = 'active'
  );
$$;

-- ============ quests: pack scoping + modes ============

alter table quests add column pack_id uuid references packs(id);
alter table quests add column mode text not null default 'targeted' check (mode in ('targeted', 'open'));
alter table quests add column finder_id uuid references profiles(id);
alter table quests alter column assignee_id drop not null;
alter table quests add constraint quests_mode_assignee check (
  (mode = 'targeted' and assignee_id is not null)
  or (mode = 'open' and assignee_id is null)
);

-- ============ migrate existing pairs ============
-- Each mutual partner_id pair becomes a two-person pack; their quests
-- move into it, and completed quests get finder attribution.

do $$
declare
  pair record;
  new_pack uuid;
begin
  for pair in
    select p.id as a, p.partner_id as b, p.display_name as a_name, q.display_name as b_name
    from profiles p
    join profiles q on q.id = p.partner_id
    where q.partner_id = p.id and p.id < p.partner_id
  loop
    insert into packs (name, owner_id)
    values (pair.a_name || ' & ' || pair.b_name, pair.a)
    returning id into new_pack;

    insert into pack_members (pack_id, user_id, role)
    values (new_pack, pair.a, 'owner'), (new_pack, pair.b, 'member');

    insert into pack_invites (pack_id, code, created_by)
    values (new_pack, upper(substr(md5(random()::text), 1, 6)), pair.a);

    update quests set pack_id = new_pack
    where (creator_id = pair.a and assignee_id = pair.b)
       or (creator_id = pair.b and assignee_id = pair.a);
  end loop;
end $$;

update quests set finder_id = assignee_id
where status = 'completed' and finder_id is null;

alter table quests alter column pack_id set not null;

-- ============ retire the partner model ============

-- handle_new_user loses pair_code before the column drops.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'User'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop policy "Users can read own and partner profile" on profiles;
create policy "Users can read own and packmates profiles"
  on profiles for select
  using (id = auth.uid() or shares_pack_with(auth.uid(), id));

drop function if exists pair_with_partner(text);
drop function if exists get_partner_id(uuid);
alter table profiles drop column partner_id;
alter table profiles drop column pair_code;

-- ============ RLS ============
-- Membership mutations (create/join/leave/remove) happen only through
-- SECURITY DEFINER RPCs below, so the tables need read policies plus
-- owner updates on packs — nothing else. Deny-by-default covers writes.

alter table packs enable row level security;
create policy "Members can read their packs"
  on packs for select
  using (is_pack_member(id, auth.uid()));
create policy "Owners can update their packs"
  on packs for update
  using (owner_id = auth.uid());

alter table pack_members enable row level security;
create policy "Members can read pack rosters"
  on pack_members for select
  using (is_pack_member(pack_id, auth.uid()));

alter table pack_invites enable row level security;
create policy "Members can read pack invites"
  on pack_invites for select
  using (is_pack_member(pack_id, auth.uid()));

-- Same reason as 008: RLS narrows, grants permit.
grant select, update on public.packs to authenticated;
grant select on public.pack_members to authenticated;
grant select on public.pack_invites to authenticated;

-- Quests: reads and writes are pack-scoped now.
drop policy "Users can read own quests" on quests;
create policy "Pack members can read pack quests"
  on quests for select
  using (is_pack_member(pack_id, auth.uid()));

drop policy "Users can create quests as creator" on quests;
create policy "Members create quests in their packs"
  on quests for insert
  with check (
    creator_id = auth.uid()
    and is_pack_member(pack_id, auth.uid())
    and (assignee_id is null or is_pack_member(pack_id, assignee_id))
  );

-- Completion now goes exclusively through the complete_quest RPC (which
-- enforces mode rules atomically); the direct-update side door closes.
drop policy "Assignees can complete quests" on quests;

-- Storage: quest photos are visible pack-wide (the feed shows teasers
-- to every member), not just to the two participants.
drop policy "Users can read quest photos" on storage.objects;
create policy "Users can read quest photos"
  on storage.objects for select
  using (
    bucket_id = 'quest-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from quests
        where is_pack_member(quests.pack_id, auth.uid())
          and (photo_path = name or completion_photo_path = name)
      )
    )
  );

-- ============ pack RPCs ============

create or replace function create_pack(p_name text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pack packs%rowtype;
  invite_code text;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Not signed in');
  end if;
  if coalesce(trim(p_name), '') = '' then
    return json_build_object('error', 'Pack name is required');
  end if;

  insert into packs (name, owner_id)
  values (trim(p_name), auth.uid())
  returning * into new_pack;

  insert into pack_members (pack_id, user_id, role)
  values (new_pack.id, auth.uid(), 'owner');

  invite_code := upper(substr(md5(random()::text), 1, 6));
  insert into pack_invites (pack_id, code, created_by)
  values (new_pack.id, invite_code, auth.uid());

  return json_build_object(
    'success', true,
    'pack_id', new_pack.id,
    'pack_name', new_pack.name,
    'invite_code', invite_code
  );
end;
$$;

create or replace function join_pack(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  invite pack_invites%rowtype;
  pack_record packs%rowtype;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Not signed in');
  end if;

  select * into invite from pack_invites
  where code = upper(trim(p_code)) and revoked_at is null;
  if invite is null then
    return json_build_object('error', 'Invalid invite code');
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    return json_build_object('error', 'This invite has expired');
  end if;
  if invite.max_uses is not null and invite.use_count >= invite.max_uses then
    return json_build_object('error', 'This invite has already been used up');
  end if;

  if exists (select 1 from pack_members where pack_id = invite.pack_id and user_id = auth.uid()) then
    return json_build_object('error', 'You are already in this pack');
  end if;

  select * into pack_record from packs where id = invite.pack_id;

  insert into pack_members (pack_id, user_id)
  values (invite.pack_id, auth.uid());
  update pack_invites set use_count = use_count + 1 where id = invite.id;

  return json_build_object(
    'success', true,
    'pack_id', pack_record.id,
    'pack_name', pack_record.name
  );
end;
$$;

create or replace function leave_pack(p_pack_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from pack_members where pack_id = p_pack_id and user_id = auth.uid()) then
    return json_build_object('error', 'You are not in this pack');
  end if;
  if exists (select 1 from packs where id = p_pack_id and owner_id = auth.uid()) then
    return json_build_object('error', 'Owners cannot leave their own pack');
  end if;

  -- Past quests keep their attribution; leaving only ends future access.
  delete from pack_members where pack_id = p_pack_id and user_id = auth.uid();
  return json_build_object('success', true);
end;
$$;

create or replace function remove_pack_member(p_pack_id uuid, p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from packs where id = p_pack_id and owner_id = auth.uid()) then
    return json_build_object('error', 'Only the pack owner can remove members');
  end if;
  if p_user_id = auth.uid() then
    return json_build_object('error', 'Owners cannot remove themselves');
  end if;
  if not exists (select 1 from pack_members where pack_id = p_pack_id and user_id = p_user_id) then
    return json_build_object('error', 'That user is not in this pack');
  end if;

  delete from pack_members where pack_id = p_pack_id and user_id = p_user_id;
  return json_build_object('success', true);
end;
$$;

create or replace function regenerate_pack_invite(p_pack_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
begin
  if not exists (select 1 from packs where id = p_pack_id and owner_id = auth.uid()) then
    return json_build_object('error', 'Only the pack owner can manage invites');
  end if;

  update pack_invites set revoked_at = now()
  where pack_id = p_pack_id and revoked_at is null;

  invite_code := upper(substr(md5(random()::text), 1, 6));
  insert into pack_invites (pack_id, code, created_by)
  values (p_pack_id, invite_code, auth.uid());

  return json_build_object('success', true, 'invite_code', invite_code);
end;
$$;

-- ============ complete_quest: mode-aware, race-safe ============

create or replace function complete_quest(
  p_quest_id uuid,
  p_photo_path text,
  p_journey_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  quest_record quests%rowtype;
  current_finder uuid;
  finder_name text;
  updated_count int;
begin
  select * into quest_record from quests where id = p_quest_id;

  if quest_record is null then
    return json_build_object('error', 'Quest not found');
  end if;

  if quest_record.mode = 'targeted' then
    if quest_record.assignee_id != auth.uid() then
      return json_build_object('error', 'Only the assignee can complete this quest');
    end if;
  else
    if quest_record.creator_id = auth.uid() then
      return json_build_object('error', 'You spotted this one — someone else has to find it');
    end if;
    if not is_pack_member(quest_record.pack_id, auth.uid()) then
      return json_build_object('error', 'Only pack members can complete this quest');
    end if;
  end if;

  -- First write wins: the status guard makes the open-mode race atomic.
  update quests set
    status = 'completed',
    finder_id = auth.uid(),
    completion_photo_path = p_photo_path,
    completion_journey_id = p_journey_id,
    completed_at = now()
  where id = p_quest_id and status = 'active';
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    select finder_id into current_finder from quests where id = p_quest_id;
    if current_finder = auth.uid() then
      -- Idempotent replay of our own completion (offline queue re-fire).
      return json_build_object('error', 'Quest is already completed');
    end if;
    select display_name into finder_name from profiles where id = current_finder;
    return json_build_object('error', 'Already found by ' || coalesce(finder_name, 'someone'));
  end if;

  return json_build_object('success', true);
end;
$$;
