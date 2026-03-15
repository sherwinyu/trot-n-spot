-- Create quest-photos storage bucket (private)
insert into storage.buckets (id, name, public)
values ('quest-photos', 'quest-photos', false);

-- Users can upload to their own folder
create policy "Users can upload own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'quest-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can read photos from quests they're involved in
create policy "Users can read quest photos"
  on storage.objects for select
  using (
    bucket_id = 'quest-photos'
    and (
      -- User's own uploads
      (storage.foldername(name))[1] = auth.uid()::text
      or
      -- Photos from quests where user is creator or assignee
      exists (
        select 1 from quests
        where (creator_id = auth.uid() or assignee_id = auth.uid())
          and (
            photo_path = name
            or completion_photo_path = name
          )
      )
    )
  );
