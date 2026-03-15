-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
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
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Pair two users together
create or replace function pair_with_partner(code text)
returns json as $$
declare
  partner_record profiles%rowtype;
  current_profile profiles%rowtype;
begin
  -- Get current user's profile
  select * into current_profile from profiles where id = auth.uid();
  if current_profile is null then
    return json_build_object('error', 'Profile not found');
  end if;

  -- Check if already paired
  if current_profile.partner_id is not null then
    return json_build_object('error', 'You are already paired with a partner');
  end if;

  -- Find partner by code
  select * into partner_record from profiles where pair_code = upper(code);
  if partner_record is null then
    return json_build_object('error', 'Invalid pair code');
  end if;

  -- Can't pair with yourself
  if partner_record.id = auth.uid() then
    return json_build_object('error', 'Cannot pair with yourself');
  end if;

  -- Check if partner is already paired
  if partner_record.partner_id is not null then
    return json_build_object('error', 'That user is already paired');
  end if;

  -- Pair both users
  update profiles set partner_id = partner_record.id where id = auth.uid();
  update profiles set partner_id = auth.uid() where id = partner_record.id;

  return json_build_object(
    'success', true,
    'partner_name', partner_record.display_name
  );
end;
$$ language plpgsql security definer;

-- Complete a quest
create or replace function complete_quest(
  p_quest_id uuid,
  p_photo_path text,
  p_journey_id uuid default null
)
returns json as $$
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
$$ language plpgsql security definer;
