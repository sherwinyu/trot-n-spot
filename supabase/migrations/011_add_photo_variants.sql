-- Store three immutable variants for each quest photo:
--   full       original pixel dimensions, maximum-quality JPEG (archive)
--   detail     1200 px wide, used on the quest detail screen
--   thumbnail  480 px wide, used in feed/history lists
-- Existing photo_path columns continue to mean "detail" so older clients and
-- rows remain compatible. Legacy rows fall back to their existing 1200 px file.

alter table quests add column photo_full_path text;
alter table quests add column photo_thumbnail_path text;
alter table quests add column completion_full_path text;
alter table quests add column completion_thumbnail_path text;

-- New quest rows may only reference immutable objects within the creator's
-- own quest folder. This also prevents a malicious path from granting a pack
-- read access to an unrelated user's private object.
drop policy "Members create quests in their packs" on quests;
create policy "Members create quests in their packs"
  on quests for insert
  with check (
    creator_id = auth.uid()
    and is_pack_member(pack_id, auth.uid())
    and (assignee_id is null or is_pack_member(pack_id, assignee_id))
    and photo_path like (auth.uid()::text || '/' || id::text || '/%')
    and (photo_full_path is null or photo_full_path like (auth.uid()::text || '/' || id::text || '/%'))
    and (photo_thumbnail_path is null or photo_thumbnail_path like (auth.uid()::text || '/' || id::text || '/%'))
  );

-- Every declared variant stays pack-private under the same membership rule.
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
          and (
            photo_path = name
            or photo_full_path = name
            or photo_thumbnail_path = name
            or completion_photo_path = name
            or completion_full_path = name
            or completion_thumbnail_path = name
          )
      )
    )
  );

-- Preserve the original RPC name and its first three arguments so installed
-- clients remain compatible. New clients send the two optional variant paths.
drop function if exists complete_quest(uuid, text, uuid);
create function complete_quest(
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

  -- Preserve the old idempotent/race result even if a retry supplies a stale
  -- or legacy path. No new object path is recorded once a quest is complete.
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

  -- First write wins: the status guard makes the open-mode race atomic.
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
