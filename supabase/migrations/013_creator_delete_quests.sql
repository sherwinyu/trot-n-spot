-- Creators can take back a quest they spotted: edit the description,
-- reassign it, or delete it outright. Deleting only removes the row; the
-- client then best-effort removes the creator's own photo variants, which
-- the storage policy below permits once nothing references them. A
-- finder's completion photo lives in the finder's folder and stays put.

-- Reassignment must land on a current packmate. The client checks its
-- roster snapshot, but a member can leave between load and save, so the
-- same invariant the insert policy enforces is applied on update too.
drop policy "Creators can update any field" on quests;
create policy "Creators can update any field"
  on quests for update
  using (creator_id = auth.uid())
  with check (
    creator_id = auth.uid()
    and (assignee_id is null or is_pack_member(pack_id, assignee_id))
  );

create policy "Creators can delete own quests"
  on quests for delete
  using (creator_id = auth.uid());

-- Own-folder objects are deletable only once no quest row points at them,
-- so a live quest or a history entry can never lose its image. Security
-- definer so rows the caller can no longer read (e.g. after leaving the
-- pack) still count as references.
create or replace function quest_photo_referenced(p_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from quests
    where photo_path = p_name
      or photo_full_path = p_name
      or photo_thumbnail_path = p_name
      or completion_photo_path = p_name
      or completion_full_path = p_name
      or completion_thumbnail_path = p_name
  );
$$;

create policy "Users can delete own unreferenced photos"
  on storage.objects for delete
  using (
    bucket_id = 'quest-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not quest_photo_referenced(name)
  );
