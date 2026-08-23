-- The assignee comparison in complete_quest predates photo variants and uses
-- SQL's nullable equality semantics. Reject anonymous calls explicitly before
-- authorization and path checks so auth.uid() can never be null during a write.

create or replace function complete_quest(
  p_quest_id uuid,
  p_photo_path text,
  p_journey_id uuid default null,
  p_photo_full_path text default null,
  p_photo_thumbnail_path text default null
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
  expected_prefix text;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Not signed in');
  end if;

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

  if quest_record.status <> 'active' then
    if quest_record.finder_id = auth.uid() then
      return json_build_object('error', 'Quest is already completed');
    end if;
    select display_name into finder_name from profiles where id = quest_record.finder_id;
    return json_build_object('error', 'Already found by ' || coalesce(finder_name, 'someone'));
  end if;

  expected_prefix := auth.uid()::text || '/' || p_quest_id::text || '/';
  if p_photo_path not like (expected_prefix || '%')
     or (p_photo_full_path is not null and p_photo_full_path not like (expected_prefix || '%'))
     or (p_photo_thumbnail_path is not null and p_photo_thumbnail_path not like (expected_prefix || '%')) then
    return json_build_object('error', 'Invalid completion photo path');
  end if;

  update quests set
    status = 'completed',
    finder_id = auth.uid(),
    completion_photo_path = p_photo_path,
    completion_full_path = p_photo_full_path,
    completion_thumbnail_path = p_photo_thumbnail_path,
    completion_journey_id = p_journey_id,
    completed_at = now()
  where id = p_quest_id and status = 'active';
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    select finder_id into current_finder from quests where id = p_quest_id;
    if current_finder = auth.uid() then
      return json_build_object('error', 'Quest is already completed');
    end if;
    select display_name into finder_name from profiles where id = current_finder;
    return json_build_object('error', 'Already found by ' || coalesce(finder_name, 'someone'));
  end if;

  return json_build_object('success', true);
end;
$$;
