-- Creators can take back a quest they spotted: edit the description or
-- reassign it (the existing "Creators can update any field" policy already
-- covers that), and delete it outright. Deleting only removes the row;
-- the client best-effort removes the creator's own photo variants, which
-- the storage policy below permits. A finder's completion photo lives in
-- the finder's folder and stays put.

create policy "Creators can delete own quests"
  on quests for delete
  using (creator_id = auth.uid());

create policy "Users can delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'quest-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
