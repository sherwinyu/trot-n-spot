-- SECURITY DEFINER functions must pin their search_path. Without it, the
-- function resolves unqualified names using the *caller's* search_path.
--
-- handle_new_user fires from GoTrue's INSERT into auth.users, which runs as
-- the `supabase_auth_admin` role. That role's search_path does not include
-- `public`, so the unqualified `insert into profiles` could not resolve the
-- table and every real sign-up failed with "Database error saving new user"
-- (HTTP 500 unexpected_failure). This never surfaced earlier because sign-up
-- through GoTrue was never exercised — local/dev used pre-seeded users and the
-- db-test suite inserts into auth.users directly through the test shim.
--
-- Re-create the three SECURITY DEFINER functions with `set search_path = public`
-- (functions keep their existing triggers/grants across create-or-replace) so
-- they resolve regardless of the caller's role. This is also the hardening the
-- Supabase advisor recommends for definer functions.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, avatar_url, pair_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'User'),
    new.raw_user_meta_data ->> 'avatar_url',
    upper(substr(md5(random()::text), 1, 6))
  );
  return new;
end;
$$;

create or replace function pair_with_partner(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  partner_record profiles%rowtype;
  current_profile profiles%rowtype;
begin
  select * into current_profile from profiles where id = auth.uid();
  if current_profile is null then
    return json_build_object('error', 'Profile not found');
  end if;

  if current_profile.partner_id is not null then
    return json_build_object('error', 'You are already paired with a partner');
  end if;

  select * into partner_record from profiles where pair_code = upper(code);
  if partner_record is null then
    return json_build_object('error', 'Invalid pair code');
  end if;

  if partner_record.id = auth.uid() then
    return json_build_object('error', 'Cannot pair with yourself');
  end if;

  if partner_record.partner_id is not null then
    return json_build_object('error', 'That user is already paired');
  end if;

  update profiles set partner_id = partner_record.id where id = auth.uid();
  update profiles set partner_id = auth.uid() where id = partner_record.id;

  return json_build_object(
    'success', true,
    'partner_name', partner_record.display_name
  );
end;
$$;

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
begin
  select * into quest_record from quests where id = p_quest_id;

  if quest_record is null then
    return json_build_object('error', 'Quest not found');
  end if;

  if quest_record.assignee_id != auth.uid() then
    return json_build_object('error', 'Only the assignee can complete this quest');
  end if;

  if quest_record.status = 'completed' then
    return json_build_object('error', 'Quest is already completed');
  end if;

  update quests set
    status = 'completed',
    completion_photo_path = p_photo_path,
    completion_journey_id = p_journey_id,
    completed_at = now()
  where id = p_quest_id;

  return json_build_object('success', true);
end;
$$;
