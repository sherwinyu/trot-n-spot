-- Photo replies are independent from completion, including authorization and storage.
set role authenticated;
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare
  q uuid := gen_random_uuid();
  other_q uuid := gen_random_uuid();
  creator uuid := auth.uid();
  finder uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  outsider uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  photo uuid := gen_random_uuid();
  text_comment uuid := gen_random_uuid();
  creator_photo uuid := gen_random_uuid();
  captured_photo uuid := gen_random_uuid();
  original uuid;
  path text;
  result json;
  completed_time timestamptz;
  affected int;
begin
  insert into quests (id, pack_id, creator_id, assignee_id, photo_path)
  values (q, 'facadefa-cade-4ace-8ade-000000000001', creator, finder, creator::text || '/' || q::text || '/detail.jpg'),
    (other_q, 'facadefa-cade-4ace-8ade-000000000001', creator, finder, creator::text || '/' || other_q::text || '/detail.jpg');
  select id into original from quest_comments where quest_id = q and kind = 'original';
  assert original is not null, 'creation adds the original photo to the thread';
  delete from quest_comments where id = original;
  get diagnostics affected = row_count;
  assert affected = 0, 'original photo cannot be deleted separately';
  begin
    update quests set completion_comment_id = original where id = q;
    raise exception 'client bypassed promotion';
  exception when insufficient_privilege then null;
  end;
  insert into quest_comments (id, quest_id, author_id, photo_path)
  values (creator_photo, q, creator, creator::text || '/' || q::text || '/fun.jpg');
  result := complete_quest_from_comment(q, creator_photo);
  assert result->>'error' = 'Only the assignee can complete this quest', 'creator may reply but not complete targeted quest';

  perform test_login(finder);
  path := finder::text || '/' || q::text || '/comments/' || photo::text;
  insert into quest_comments (id, quest_id, author_id, photo_path, photo_full_path, photo_thumbnail_path)
  values (photo, q, finder, path || '/detail.jpg', path || '/full.jpg', path || '/thumbnail.jpg');
  assert (select status from quests where id = q) = 'active', 'photo reply leaves quest active';
  assert (select finder_id from quests where id = q) is null, 'photo reply does not set finder';
  assert (select completed_at from quests where id = q) is null, 'photo reply does not set completion time';
  assert (select completion_comment_id from quests where id = q) is null, 'photo reply is not promoted';
  insert into quest_comments (id, quest_id, author_id, body) values (text_comment, q, finder, 'A clue');
  result := complete_quest_from_comment(q, text_comment);
  assert result->>'error' is not null, 'text cannot complete';
  result := complete_quest_from_comment(other_q, photo);
  assert result->>'error' is not null, 'photo from another quest cannot complete';
  result := complete_quest_from_comment(q, creator_photo);
  assert result->>'error' is not null, 'someone else''s photo cannot complete';
  result := complete_quest_from_comment(q, original);
  assert result->>'error' is not null, 'original cannot complete';
  result := complete_quest_from_comment(q, photo, gen_random_uuid());
  assert result->>'error' = 'Invalid journey', 'promotion rejects invalid journey';
  assert (select status from quests where id = q) = 'active', 'failed promotion leaves the quest active';
  begin
    insert into quest_comments (quest_id, author_id, photo_path)
    values (q, finder, creator::text || '/' || q::text || '/stolen.jpg');
    raise exception 'foreign photo path accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into quest_comments (quest_id, author_id, photo_path, photo_full_path)
    values (q, finder, path || '/valid.jpg', creator::text || '/' || q::text || '/stolen-full.jpg');
    raise exception 'foreign variant accepted';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name) values
    ('quest-photos', path || '/detail.jpg'), ('quest-photos', path || '/full.jpg'), ('quest-photos', path || '/thumbnail.jpg');
  delete from storage.objects where name like path || '/%';
  get diagnostics affected = row_count;
  assert affected = 0, 'referenced reply photos cannot be deleted';
  perform test_login(creator);
  assert (select count(*) from storage.objects where name like path || '/%') = 3, 'packmates read all reply variants';
  perform test_login(outsider);
  assert (select count(*) from storage.objects where name like path || '/%') = 0, 'outsiders cannot read reply photos';
  assert (select count(*) from quest_comments where id = photo) = 0, 'outsiders cannot read photo comments';
  result := complete_quest_from_comment(q, photo);
  assert result->>'error' = 'Only pack members can complete this quest', 'outsider cannot promote';
  assert not has_function_privilege('anon', 'complete_quest_from_comment(uuid,uuid,uuid)', 'execute'), 'anon cannot promote';

  perform test_login(finder);
  result := complete_quest_from_comment(q, photo);
  assert (result->>'success')::boolean, 'eligible finder promotes own photo';
  select completed_at into completed_time from quests where id = q;
  assert (select completion_photo_path from quests where id = q) = path || '/detail.jpg', 'legacy completion detail preserved';
  assert (select completion_full_path from quests where id = q) = path || '/full.jpg', 'legacy full variant preserved';
  assert (select completion_thumbnail_path from quests where id = q) = path || '/thumbnail.jpg', 'legacy thumbnail preserved';
  assert (select completion_comment_id from quests where id = q) = photo, 'promoted comment linked';
  assert (select finder_id from quests where id = q) = finder, 'finder is photo author';
  result := complete_quest_from_comment(q, photo);
  assert (result->>'success')::boolean, 'same promotion is idempotent after a lost response';
  assert (select completed_at from quests where id = q) = completed_time, 'retry preserves completion time';
  delete from quest_comments where id = photo;
  get diagnostics affected = row_count;
  assert affected = 0, 'completion evidence cannot be deleted';
  insert into quest_comments (quest_id, author_id, body, photo_path)
  values (q, finder, 'Still a fun photo', path || '/after.jpg');
  assert (select completion_comment_id from quests where id = q) = photo, 'later photos do not replace completion';
  delete from quest_comments where photo_path = path || '/after.jpg';
  get diagnostics affected = row_count;
  assert affected = 1, 'unpromoted photo can be deleted';

  path := finder::text || '/' || other_q::text || '/comments/' || captured_photo::text;
  result := complete_quest_with_photo_comment(other_q, path || '/detail.jpg', captured_photo, 'My find', gen_random_uuid());
  assert result->>'error' = 'Invalid journey', 'atomic capture rejects invalid journey';
  assert not exists (select 1 from quest_comments where id = captured_photo), 'failed capture promotion rolls back its reply';
  result := complete_quest_with_photo_comment(other_q, path || '/detail.jpg', creator_photo);
  assert result->>'error' is not null, 'atomic capture rejects an id belonging to another author/quest';
  result := complete_quest_with_photo_comment(other_q, path || '/detail.jpg', captured_photo, 'My find', null, path || '/full.jpg', path || '/thumbnail.jpg');
  assert (result->>'success')::boolean, 'capture inserts and promotes atomically';
  assert result->'comment'->>'body' = 'My find', 'capture preserves its caption';
  assert (select completion_comment_id from quests where id = other_q) = captured_photo, 'capture links client-generated comment id';
  result := complete_quest_with_photo_comment(other_q, path || '/detail.jpg', captured_photo, 'Retry');
  assert (result->>'success')::boolean, 'atomic capture retry is idempotent';
  assert (select count(*) from quest_comments where quest_id = other_q and kind = 'reply') = 1, 'retry does not insert another reply';
  assert result->'comment'->>'body' = 'My find', 'retry retains original caption';
  assert not has_function_privilege('anon', 'complete_quest_with_photo_comment(uuid,text,uuid,text,uuid,text,text)', 'execute'), 'anon cannot complete from capture';

  path := finder::text || '/' || q::text || '/comments/' || photo::text;
  perform test_login(creator);
  delete from quests where id in (q, other_q);
  assert not exists (select 1 from quest_comments where quest_id = q), 'completed quest and its linked comments cascade together';
  perform test_login(finder);
  delete from storage.objects where name like path || '/%';
  get diagnostics affected = row_count;
  assert affected = 3, 'unreferenced reply photos can be cleaned up';
  raise notice 'PASS: photo replies, promotion permissions, idempotency, storage RLS, and cascade';
end $$;

reset role;
do $$
begin
  assert not exists (
    select 1 from quests q where q.status = 'completed' and q.completion_photo_path is not null
    and not exists (select 1 from quest_comments c where c.id = q.completion_comment_id
      and c.quest_id = q.id and c.photo_path = q.completion_photo_path and c.author_id = q.finder_id)
  ), 'seeded and legacy RPC completions have linked photo comments';
  raise notice 'PASS: legacy clients and seeded completions use photo comments';
end $$;
