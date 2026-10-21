-- Photos live in the thread; quests retain their photo columns for installed clients.
alter table quest_comments
  add column kind text not null default 'reply' check (kind in ('original', 'reply')),
  add column photo_path text,
  add column photo_full_path text,
  add column photo_thumbnail_path text;
alter table quest_comments alter column body set default '';
alter table quest_comments drop constraint quest_comments_body_check;
alter table quest_comments add constraint quest_comments_content_check check (
  char_length(btrim(body)) <= 500
  and (char_length(btrim(body)) > 0 or nullif(btrim(photo_path), '') is not null)
  and (photo_path is not null or (photo_full_path is null and photo_thumbnail_path is null))
);
create unique index quest_comments_original_idx on quest_comments(quest_id) where kind = 'original';
alter table quest_comments add constraint quest_comments_quest_id_id_key unique (quest_id, id);
alter table quests add column completion_comment_id uuid;
alter table quests add constraint quests_completion_comment_fkey
  foreign key (id, completion_comment_id) references quest_comments(quest_id, id);

-- Backfills must not send comment notifications.
drop trigger quest_comments_notify_push on quest_comments;
insert into quest_comments (quest_id, author_id, kind, body, photo_path, photo_full_path, photo_thumbnail_path, created_at)
select id, creator_id, 'original', '', photo_path, photo_full_path, photo_thumbnail_path, created_at from quests;
with inserted as (
  insert into quest_comments (quest_id, author_id, body, photo_path, photo_full_path, photo_thumbnail_path, created_at)
  select id, coalesce(finder_id, assignee_id), '', completion_photo_path, completion_full_path,
    completion_thumbnail_path, coalesce(completed_at, created_at)
  from quests where status = 'completed' and completion_photo_path is not null
  returning id, quest_id
)
update quests q set completion_comment_id = c.id from inserted c where c.quest_id = q.id;

-- Also covers quest creation/completion from installed clients and seed imports.
create function sync_quest_photo_comments()
returns trigger language plpgsql security definer set search_path = public as $$
declare comment_id uuid;
begin
  insert into quest_comments (quest_id, author_id, kind, body, photo_path, photo_full_path, photo_thumbnail_path, created_at)
  values (new.id, new.creator_id, 'original', '', new.photo_path, new.photo_full_path, new.photo_thumbnail_path, new.created_at)
  on conflict (quest_id) where kind = 'original' do update set
    photo_path = excluded.photo_path, photo_full_path = excluded.photo_full_path,
    photo_thumbnail_path = excluded.photo_thumbnail_path;
  if new.status = 'completed' and new.completion_comment_id is null and new.completion_photo_path is not null then
    insert into quest_comments (quest_id, author_id, body, photo_path, photo_full_path, photo_thumbnail_path, created_at)
    values (new.id, coalesce(new.finder_id, new.assignee_id), '', new.completion_photo_path,
      new.completion_full_path, new.completion_thumbnail_path, coalesce(new.completed_at, new.created_at))
    returning id into comment_id;
    update quests set completion_comment_id = comment_id where id = new.id;
  end if;
  return new;
end;
$$;
create trigger quests_sync_photo_comments
  after insert or update of photo_path, photo_full_path, photo_thumbnail_path,
    completion_photo_path, completion_full_path, completion_thumbnail_path, status on quests
  for each row execute function sync_quest_photo_comments();

create trigger quest_comments_notify_push
  after insert on quest_comments for each row
  when (new.kind = 'reply') execute function notify_push_event();

drop policy "Pack members comment as themselves" on quest_comments;
create policy "Pack members comment as themselves" on quest_comments for insert with check (
  author_id = auth.uid() and kind = 'reply' and is_pack_member(pack_id, auth.uid())
  and (photo_path is null or photo_path like (auth.uid()::text || '/' || quest_id::text || '/%'))
  and (photo_full_path is null or photo_full_path like (auth.uid()::text || '/' || quest_id::text || '/%'))
  and (photo_thumbnail_path is null or photo_thumbnail_path like (auth.uid()::text || '/' || quest_id::text || '/%'))
);
drop policy "Authors delete own comments" on quest_comments;
create policy "Authors delete own comments" on quest_comments for delete using (
  author_id = auth.uid() and kind = 'reply' and is_pack_member(pack_id, auth.uid())
  and not exists (select 1 from quests where completion_comment_id = quest_comments.id)
);

-- Completion and photo linkage can only change through the RPCs.
revoke update on quests from authenticated;
grant update (description, assignee_id, mode) on quests to authenticated;
drop policy "Members create quests in their packs" on quests;
create policy "Members create quests in their packs" on quests for insert with check (
  creator_id = auth.uid() and is_pack_member(pack_id, auth.uid())
  and (assignee_id is null or is_pack_member(pack_id, assignee_id))
  and status = 'active' and finder_id is null and completion_comment_id is null
  and completion_photo_path is null and completion_full_path is null and completion_thumbnail_path is null
  and completed_at is null and completion_journey_id is null
  and photo_path like (auth.uid()::text || '/' || id::text || '/%')
  and (photo_full_path is null or photo_full_path like (auth.uid()::text || '/' || id::text || '/%'))
  and (photo_thumbnail_path is null or photo_thumbnail_path like (auth.uid()::text || '/' || id::text || '/%'))
);

create function complete_quest_from_comment(p_quest_id uuid, p_comment_id uuid, p_journey_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare q quests%rowtype; c quest_comments%rowtype; finder_name text;
begin
  if auth.uid() is null then return json_build_object('error', 'Not signed in'); end if;
  select * into q from quests where id = p_quest_id for update;
  if not found then return json_build_object('error', 'Quest not found'); end if;
  if not is_pack_member(q.pack_id, auth.uid()) then
    return json_build_object('error', 'Only pack members can complete this quest');
  end if;
  if q.mode = 'targeted' and q.assignee_id is distinct from auth.uid() then
    return json_build_object('error', 'Only the assignee can complete this quest');
  end if;
  if q.mode = 'open' and q.creator_id = auth.uid() then
    return json_build_object('error', 'You spotted this one — someone else has to find it');
  end if;
  if q.status <> 'active' then
    if q.finder_id = auth.uid() and q.completion_comment_id = p_comment_id then
      return json_build_object('success', true);
    end if;
    select display_name into finder_name from profiles where id = q.finder_id;
    return json_build_object('error', 'Already found by ' || coalesce(finder_name, 'someone'));
  end if;
  select * into c from quest_comments where id = p_comment_id and quest_id = q.id for update;
  if not found or c.kind <> 'reply' or c.photo_path is null or c.author_id <> auth.uid() then
    return json_build_object('error', 'Choose one of your photo comments on this quest');
  end if;
  if p_journey_id is not null and not exists (select 1 from journeys where id = p_journey_id and user_id = auth.uid()) then
    return json_build_object('error', 'Invalid journey');
  end if;
  update quests set status = 'completed', finder_id = c.author_id,
    completion_comment_id = c.id, completion_photo_path = c.photo_path,
    completion_full_path = c.photo_full_path, completion_thumbnail_path = c.photo_thumbnail_path,
    completion_journey_id = p_journey_id, completed_at = now()
  where id = q.id;
  return json_build_object('success', true);
end;
$$;

-- Old clients still submit paths. Insert a comment and promote it in one transaction.
create or replace function complete_quest(
  p_quest_id uuid, p_photo_path text, p_journey_id uuid default null,
  p_photo_full_path text default null, p_photo_thumbnail_path text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare q quests%rowtype; comment_id uuid; result json; expected_prefix text; finder_name text;
begin
  if auth.uid() is null then return json_build_object('error', 'Not signed in'); end if;
  select * into q from quests where id = p_quest_id for update;
  if not found then return json_build_object('error', 'Quest not found'); end if;
  if not is_pack_member(q.pack_id, auth.uid()) then
    return json_build_object('error', 'Only pack members can complete this quest');
  end if;
  if q.status = 'completed' and q.finder_id = auth.uid() then
    return json_build_object('error', 'Quest is already completed');
  end if;
  -- Preserve legacy error ordering; promotion rechecks authorization below.
  if q.mode = 'targeted' and q.assignee_id is distinct from auth.uid() then
    return json_build_object('error', 'Only the assignee can complete this quest');
  end if;
  if q.mode = 'open' and q.creator_id = auth.uid() then
    return json_build_object('error', 'You spotted this one — someone else has to find it');
  end if;
  if q.status <> 'active' then
    select display_name into finder_name from profiles where id = q.finder_id;
    return json_build_object('error', 'Already found by ' || coalesce(finder_name, 'someone'));
  end if;
  expected_prefix := auth.uid()::text || '/' || p_quest_id::text || '/';
  if p_photo_path is null or p_photo_path not like (expected_prefix || '%')
    or (p_photo_full_path is not null and p_photo_full_path not like (expected_prefix || '%'))
    or (p_photo_thumbnail_path is not null and p_photo_thumbnail_path not like (expected_prefix || '%')) then
    return json_build_object('error', 'Invalid completion photo path');
  end if;
  begin
    insert into quest_comments (quest_id, author_id, body, photo_path, photo_full_path, photo_thumbnail_path)
    values (q.id, auth.uid(), '', p_photo_path, p_photo_full_path, p_photo_thumbnail_path)
    returning id into comment_id;
    result := complete_quest_from_comment(q.id, comment_id, p_journey_id);
    if result->>'error' is not null then raise exception '%', result->>'error'; end if;
    return result;
  exception when raise_exception then
    return json_build_object('error', sqlerrm);
  end;
end;
$$;
revoke all on function complete_quest_from_comment(uuid, uuid, uuid) from public;
grant execute on function complete_quest_from_comment(uuid, uuid, uuid) to authenticated;

create or replace function quest_photo_referenced(p_name text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from quest_comments
    where photo_path = p_name or photo_full_path = p_name or photo_thumbnail_path = p_name
  ) or exists (
    select 1 from quests where photo_path = p_name or photo_full_path = p_name or photo_thumbnail_path = p_name
      or completion_photo_path = p_name or completion_full_path = p_name or completion_thumbnail_path = p_name
  );
$$;
drop policy "Users can read quest photos" on storage.objects;
create policy "Users can read quest photos" on storage.objects for select using (
  bucket_id = 'quest-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from quest_comments c where is_pack_member(c.pack_id, auth.uid())
        and (c.photo_path = name or c.photo_full_path = name or c.photo_thumbnail_path = name)
    )
  )
);
