-- DB-layer tests: RLS policies + RPC functions, run as the
-- `authenticated` role with auth.uid() faked via the JWT-claims GUC.
-- Every block raises on failure; a clean run prints only PASS notices.
\set ON_ERROR_STOP on

-- ============ helpers ============
create or replace function test_login(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id)::text, false)::void;
$$ language sql volatile;

-- ============ fixtures ============
-- Seeded users: a = Sherwin, b = Nadia (share a pack). Add two fresh
-- users for pack lifecycle tests and one stranger for RLS tests.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'test-carol@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Carol"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'test-dave@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Dave"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'test-eve@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Eve"}'::jsonb, now(), now(), '', '', '', '');

-- Variant metadata + storage objects matching one seeded quest, for storage RLS tests
update quests set
  photo_full_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/full.jpg',
  photo_thumbnail_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/thumbnail.jpg'
where id = '11111111-1111-1111-1111-111111111111';

insert into storage.objects (bucket_id, name)
values
  ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg'),
  ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/full.jpg'),
  ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/thumbnail.jpg');

-- ============ profile trigger ============
do $$
begin
  assert (select count(*) from profiles) = 5, 'expected 5 profiles (2 seeded + 3 new)';
  assert (select display_name from profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = 'Carol', 'display_name from metadata';
  raise notice 'PASS: handle_new_user trigger creates profiles';
end $$;

-- ============ pair migration (010) ============
-- The seed builds the pack directly, but the migration must also have
-- left the seeded quests pack-scoped with finder attribution.
do $$
begin
  assert (select count(*) from packs) = 1, 'one seeded pack';
  assert (select count(*) from pack_members where pack_id = 'facadefa-cade-4ace-8ade-000000000001') = 2, 'both users in the pack';
  assert (select count(*) from quests where pack_id is null) = 0, 'every quest belongs to a pack';
  assert (select finder_id from quests where id = '44444444-4444-4444-4444-444444444444') = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'completed quest has finder attribution';
  raise notice 'PASS: seeded pack + quests are pack-scoped with finders';
end $$;

-- ============ RLS as authenticated users ============
set role authenticated;

-- Sherwin sees his pack's quests and his packmate's profile, not more
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  assert (select count(*) from quests) = 6, 'sherwin sees all 6 pack quests (incl. the open one)';
  assert (select count(*) from profiles) = 2, 'sherwin sees only his own and packmate profiles';
  assert (select count(*) from packs) = 1, 'sherwin sees his pack';
  assert (select count(*) from pack_members) = 2, 'sherwin sees the pack roster';
  assert (select code from pack_invites limit 1) = 'WOOF01', 'sherwin can read the pack invite code';
  raise notice 'PASS: member sees pack quests, roster, invite, and packmate profiles';
end $$;

-- A stranger sees nothing
select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
begin
  assert (select count(*) from quests) = 0, 'stranger sees no quests';
  assert (select count(*) from journeys) = 0, 'stranger sees no journeys';
  assert (select count(*) from profiles) = 1, 'stranger sees only own profile';
  assert (select count(*) from packs) = 0, 'stranger sees no packs';
  assert (select count(*) from pack_invites) = 0, 'stranger sees no invites';
  raise notice 'PASS: stranger is fully isolated by RLS';
end $$;

-- Stranger cannot update others'' quests (0 rows affected)
select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
declare updated_count int;
begin
  update quests set description = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics updated_count = row_count;
  assert updated_count = 0, 'stranger update must affect 0 rows';
  raise notice 'PASS: stranger cannot modify quests';
end $$;

-- Quest INSERT: only as self, only into own packs
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
begin
  begin
    insert into quests (pack_id, creator_id, assignee_id, photo_path)
    values ('facadefa-cade-4ace-8ade-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'x/y/z.jpg');
    raise exception 'should not allow inserting quest as someone else';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS insert policy rejects
  end;
  begin
    insert into quests (pack_id, creator_id, assignee_id, photo_path)
    values ('facadefa-cade-4ace-8ade-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x/y/z.jpg');
    raise exception 'should not allow inserting into a pack you are not in';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  raise notice 'PASS: cannot create quests impersonating others or in foreign packs';
end $$;

-- ============ create_pack / join_pack RPCs ============
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
declare
  result json;
  carol_pack uuid;
  carol_code text;
begin
  -- empty name rejected
  result := create_pack('   ');
  assert result ->> 'error' = 'Pack name is required', 'blank name rejected';

  -- create succeeds, returns an invite code
  result := create_pack('Dog Squad');
  assert (result ->> 'success')::boolean, 'pack created';
  assert result ->> 'invite_code' ~ '^[0-9A-F]{6}$', 'invite code generated';
  carol_pack := (result ->> 'pack_id')::uuid;
  carol_code := result ->> 'invite_code';

  assert (select role from pack_members where pack_id = carol_pack and user_id = auth.uid()) = 'owner', 'creator is owner';

  -- invalid code
  result := join_pack('ZZZZZZ');
  assert result ->> 'error' = 'Invalid invite code', 'invalid code rejected';

  -- joining your own pack
  result := join_pack(carol_code);
  assert result ->> 'error' = 'You are already in this pack', 'rejoin rejected';

  raise notice 'PASS: create_pack + join_pack validation (blank name, invalid code, rejoin)';
end $$;

-- Dave and Eve join Carol's pack via the invite code
select test_login('dddddddd-dddd-dddd-dddd-dddddddddddd');
do $$
declare
  carol_code text;
  result json;
begin
  reset role; -- look up fixture data as superuser
  select code into carol_code from pack_invites pi join packs p on p.id = pi.pack_id
    where p.name = 'Dog Squad' and pi.revoked_at is null;
  set local role authenticated;

  result := join_pack(carol_code);
  assert (result ->> 'success')::boolean, 'dave joins';
  assert result ->> 'pack_name' = 'Dog Squad', 'returns pack name';

  perform test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  result := join_pack(lower(carol_code)); -- codes are case-insensitive
  assert (result ->> 'success')::boolean, 'eve joins with lowercased code';

  reset role;
  assert (select count(*) from pack_members pm join packs p on p.id = pm.pack_id where p.name = 'Dog Squad') = 3, 'three members';
  set local role authenticated;

  raise notice 'PASS: invite codes admit new members (case-insensitive)';
end $$;

-- Members of one pack still can't see another pack's data
set role authenticated;
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
begin
  assert (select count(*) from quests) = 0, 'carol sees no quests from packs she is not in';
  assert (select count(*) from packs) = 1, 'carol sees only her own pack';
  raise notice 'PASS: pack isolation holds between packs';
end $$;

-- ============ complete_quest RPC: targeted mode ============
-- Quest 1: creator = Nadia (b), assignee = Sherwin (a)

-- Anonymous callers are rejected before nullable auth comparisons.
reset role;
select set_config('request.jwt.claims', '{}'::text, false);
set role anon;
do $$
declare result json;
begin
  result := complete_quest(
    '11111111-1111-1111-1111-111111111111',
    'anonymous/11111111-1111-1111-1111-111111111111/completion.jpg',
    null
  );
  assert result ->> 'error' = 'Not signed in', 'anonymous completion rejected';
  raise notice 'PASS: complete_quest requires authentication';
end $$;
reset role;
set role authenticated;

-- Creator cannot complete own quest
select test_login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
declare result json;
begin
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'b/1/completion.jpg', null);
  assert result ->> 'error' = 'Only the assignee can complete this quest', 'creator blocked from completing';
  raise notice 'PASS: only the assignee can complete a targeted quest';
end $$;

-- Assignee completes it
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare result json;
begin
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'x.jpg', null);
  assert result ->> 'error' = 'Invalid completion photo path', 'completion path is scoped to finder and quest';

  result := complete_quest(
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/completion-detail.jpg',
    null,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/completion-full.jpg',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/completion-thumbnail.jpg'
  );
  assert (result ->> 'success')::boolean, 'assignee completes quest';

  reset role;
  assert (select status from quests where id = '11111111-1111-1111-1111-111111111111') = 'completed', 'status flipped';
  assert (select completed_at from quests where id = '11111111-1111-1111-1111-111111111111') is not null, 'completed_at set';
  assert (select finder_id from quests where id = '11111111-1111-1111-1111-111111111111') = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'finder recorded';
  assert (select completion_photo_path from quests where id = '11111111-1111-1111-1111-111111111111') like '%/completion-detail.jpg', 'completion detail path recorded';
  assert (select completion_full_path from quests where id = '11111111-1111-1111-1111-111111111111') like '%/completion-full.jpg', 'completion full path recorded';
  assert (select completion_thumbnail_path from quests where id = '11111111-1111-1111-1111-111111111111') like '%/completion-thumbnail.jpg', 'completion thumbnail path recorded';
  set local role authenticated;

  -- double completion (offline replay) stays idempotent
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'x.jpg', null);
  assert result ->> 'error' = 'Quest is already completed', 'double completion rejected';

  raise notice 'PASS: complete_quest targeted (success, finder, timestamp, double-complete)';
end $$;

-- Unknown quest
do $$
declare result json;
begin
  result := complete_quest('99999999-9999-9999-9999-999999999999', 'x.jpg', null);
  assert result ->> 'error' = 'Quest not found', 'unknown quest error';
  raise notice 'PASS: complete_quest rejects unknown quest';
end $$;

-- ============ complete_quest RPC: open mode ============
-- Quest 6: creator = Nadia (b), open to the pack

-- Creator cannot claim their own spot
select test_login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
declare result json;
begin
  result := complete_quest('66666666-6666-6666-6666-666666666666', 'b/6/completion.jpg', null);
  assert result ->> 'error' like 'You spotted this one%', 'creator blocked from open quest';
  raise notice 'PASS: creator cannot complete their own open quest';
end $$;

-- Non-members cannot complete it
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
declare result json;
begin
  result := complete_quest('66666666-6666-6666-6666-666666666666', 'c/6/completion.jpg', null);
  assert result ->> 'error' = 'Only pack members can complete this quest', 'non-member blocked';
  raise notice 'PASS: open quests are pack-scoped';
end $$;

-- First member to complete wins; latecomers learn who beat them
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare result json;
begin
  result := complete_quest('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/66666666-6666-6666-6666-666666666666/completion.jpg', null);
  assert (result ->> 'success')::boolean, 'first finder succeeds';

  reset role;
  assert (select finder_id from quests where id = '66666666-6666-6666-6666-666666666666') = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'open finder recorded';
  set local role authenticated;

  raise notice 'PASS: open quest completion records the finder';
end $$;

-- Race: Dave completes an open quest in Dog Squad, then Eve tries
set role authenticated;
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
declare
  carol_pack uuid;
  race_quest uuid := '77777777-7777-7777-7777-777777777777';
  result json;
begin
  reset role;
  select id into carol_pack from packs where name = 'Dog Squad';
  set local role authenticated;

  insert into quests (id, pack_id, creator_id, assignee_id, mode, photo_path, description)
  values (race_quest, carol_pack, auth.uid(), null, 'open', 'cccccccc-cccc-cccc-cccc-cccccccccccc/77777777-7777-7777-7777-777777777777/detail.jpg', 'race test');

  perform test_login('dddddddd-dddd-dddd-dddd-dddddddddddd');
  result := complete_quest(race_quest, 'dddddddd-dddd-dddd-dddd-dddddddddddd/77777777-7777-7777-7777-777777777777/completion-detail.jpg', null);
  assert (result ->> 'success')::boolean, 'dave wins the race';

  perform test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  result := complete_quest(race_quest, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/77777777-7777-7777-7777-777777777777/completion-detail.jpg', null);
  assert result ->> 'error' = 'Already found by Dave', 'loser told who won';

  perform test_login('dddddddd-dddd-dddd-dddd-dddddddddddd');
  result := complete_quest(race_quest, 'x.jpg', null);
  assert result ->> 'error' = 'Quest is already completed', 'winner replay is idempotent';

  raise notice 'PASS: open quest race (first write wins, loser sees finder name)';
end $$;

-- ============ leave / remove / invite management ============
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
declare
  carol_pack uuid;
  result json;
  old_code text;
begin
  reset role;
  select id into carol_pack from packs where name = 'Dog Squad';
  set local role authenticated;

  -- owner cannot leave
  result := leave_pack(carol_pack);
  assert result ->> 'error' = 'Owners cannot leave their own pack', 'owner cannot leave';

  -- eve leaves
  perform test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  result := leave_pack(carol_pack);
  assert (result ->> 'success')::boolean, 'member leaves';

  -- only the owner can remove members
  perform test_login('dddddddd-dddd-dddd-dddd-dddddddddddd');
  result := remove_pack_member(carol_pack, 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  assert result ->> 'error' = 'Only the pack owner can remove members', 'non-owner cannot remove';

  -- owner removes dave; his past finds stay attributed
  perform test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
  result := remove_pack_member(carol_pack, 'dddddddd-dddd-dddd-dddd-dddddddddddd');
  assert (result ->> 'success')::boolean, 'owner removes member';

  reset role;
  assert (select count(*) from pack_members where pack_id = carol_pack) = 1, 'only carol remains';
  assert (select finder_id from quests where description = 'race test') = 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'departed member keeps finder attribution';
  set local role authenticated;

  -- owner rotates the invite; the old code stops working
  reset role;
  select code into old_code from pack_invites where pack_id = carol_pack and revoked_at is null;
  set local role authenticated;
  result := regenerate_pack_invite(carol_pack);
  assert (result ->> 'success')::boolean, 'invite regenerated';

  perform test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  result := join_pack(old_code);
  assert result ->> 'error' = 'Invalid invite code', 'revoked code rejected';

  raise notice 'PASS: leave/remove/regenerate (owner rules, attribution survives removal)';
end $$;

-- ============ storage RLS ============
-- Upload into own folder OK, someone else's folder blocked
set role authenticated;
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('quest-photos', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/some-quest/original.jpg');

  begin
    insert into storage.objects (bucket_id, name)
    values ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/sneaky/original.jpg');
    raise exception 'should not allow uploading into another user''s folder';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  raise notice 'PASS: storage uploads restricted to own folder';
end $$;

-- Packmates can read each other's quest photos; outsiders cannot
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  assert (select count(*) from storage.objects
          where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/%') = 3,
    'packmate reads all quest photo variants';
  raise notice 'PASS: packmate can read all quest photo variants';
end $$;

select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
begin
  assert (select count(*) from storage.objects
          where name like 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/%') = 0,
    'outsider cannot read quest photo variants';
  raise notice 'PASS: outsider cannot read another pack''s quest photo variants';
end $$;

-- ============ creator edit / delete (013) ============
-- Quest 2: creator = Nadia (b), assignee = Sherwin (a). Only the creator
-- may edit or delete; a packmate (even the assignee) and a stranger get 0 rows.
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare affected int;
begin
  update quests set description = 'assignee edit' where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  assert affected = 0, 'assignee cannot edit a packmate''s quest';
  delete from quests where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  assert affected = 0, 'assignee cannot delete a packmate''s quest';
  raise notice 'PASS: non-creator packmate cannot edit or delete quests';
end $$;

select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
declare affected int;
begin
  delete from quests where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  assert affected = 0, 'stranger delete must affect 0 rows';
  raise notice 'PASS: stranger cannot delete quests';
end $$;

select test_login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
declare affected int;
begin
  update quests set description = 'edited by creator', assignee_id = null, mode = 'open'
    where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  assert affected = 1, 'creator edits own quest';
  assert (select description from quests where id = '22222222-2222-2222-2222-222222222222') = 'edited by creator', 'description updated';
  assert (select mode from quests where id = '22222222-2222-2222-2222-222222222222') = 'open', 'reassigned to the pack';

  -- Client guards reassignment with status = 'active' so a hunt completed
  -- mid-edit keeps its finder/assignee pairing (quest 5 is completed).
  update quests set assignee_id = null, mode = 'open'
    where id = '55555555-5555-5555-5555-555555555555' and status = 'active';
  get diagnostics affected = row_count;
  assert affected = 0, 'reassign of a completed quest is a no-op under the active guard';
  update quests set description = 'hint edit on completed quest'
    where id = '55555555-5555-5555-5555-555555555555';
  get diagnostics affected = row_count;
  assert affected = 1, 'creator can still edit the hint of a completed quest';

  -- Reassigning to someone outside the pack is rejected at the DB even
  -- though the creator passes the row-level USING check (Eve is a stranger).
  begin
    update quests set assignee_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', mode = 'targeted'
      where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'reassign to non-member should have been rejected';
  exception when insufficient_privilege then
    null;
  end;
  assert (select assignee_id from quests where id = '22222222-2222-2222-2222-222222222222') is null, 'assignee unchanged after rejected reassign';

  -- The seeded photo_path of quest 2 is this object: while the row exists
  -- the object is still referenced and must survive a delete attempt.
  insert into storage.objects (bucket_id, name)
  values ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/22222222-2222-2222-2222-222222222222/original.jpg');
  delete from storage.objects
    where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/22222222-2222-2222-2222-222222222222/original.jpg';
  get diagnostics affected = row_count;
  assert affected = 0, 'photo still referenced by a quest cannot be deleted';

  delete from quests where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics affected = row_count;
  assert affected = 1, 'creator deletes own quest';
  assert (select count(*) from quests where id = '22222222-2222-2222-2222-222222222222') = 0, 'quest gone';

  delete from storage.objects
    where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/22222222-2222-2222-2222-222222222222/original.jpg';
  get diagnostics affected = row_count;
  assert affected = 1, 'creator removes own photo object once unreferenced';
  raise notice 'PASS: creator can edit and delete own quest';
end $$;

-- Photos in someone else's folder are off limits even for pack members
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare affected int;
begin
  delete from storage.objects
    where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/full.jpg';
  get diagnostics affected = row_count;
  assert affected = 0, 'packmate cannot delete another user''s photo';
  raise notice 'PASS: storage deletes restricted to own folder';
end $$;

-- ============ push trigger resilience ============
reset role;
-- With webhook config present but pg_net absent, quest writes must
-- still succeed (warning, not error).
insert into app_config (key, value) values ('push_webhook_url', 'http://localhost:9999/functions/v1/send-push-notification');
do $$
begin
  insert into quests (pack_id, creator_id, assignee_id, photo_path, description)
  values ('facadefa-cade-4ace-8ade-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/trigger-test/original.jpg', 'trigger resilience test');
  raise notice 'PASS: quest insert survives push-webhook dispatch failure';
end $$;
-- Pack joins now dispatch too, and go through the RPC as a real user.
set role authenticated;
select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
declare
  result jsonb;
begin
  result := join_pack('WOOF01');
  assert result->>'error' is null, 'join_pack with webhook configured: ' || coalesce(result->>'error', '');
  raise notice 'PASS: pack join survives push-webhook dispatch failure';
end $$;
reset role;
delete from app_config where key = 'push_webhook_url';

-- ============ push_tokens + push_enabled ============
do $$
begin
  assert not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'push_token'
  ), 'profiles.push_token dropped';
  assert (select bool_and(push_enabled) from profiles), 'push_enabled defaults on';
  raise notice 'PASS: profiles.push_token replaced by push_enabled';
end $$;

set role authenticated;
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into push_tokens (token, user_id, platform)
values ('ExponentPushToken[sherwin-phone]', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ios'),
       ('ExponentPushToken[sherwin-tablet]', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'android');
-- Re-registering the same device is an upsert, not a conflict.
insert into push_tokens (token, user_id, platform)
values ('ExponentPushToken[sherwin-phone]', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ios')
on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform;
do $$
begin
  assert (select count(*) from push_tokens) = 2, 'sherwin keeps one row per device';
  begin
    insert into push_tokens (token, user_id, platform)
    values ('ExponentPushToken[forged]', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ios');
    raise exception 'sherwin registered a token for nadia';
  exception when insufficient_privilege or check_violation then null;
  end;
  update profiles set push_enabled = false where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  assert (select push_enabled from profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = false, 'user can mute push';
  raise notice 'PASS: push_tokens RLS + push_enabled toggle';
end $$;

select test_login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
begin
  assert (select count(*) from push_tokens) = 0, 'nadia cannot see sherwin''s tokens';
  raise notice 'PASS: push tokens are private to their owner';
end $$;

-- Nadia signs in on Sherwin's tablet: the RPC re-homes the device token.
select register_push_token('ExponentPushToken[sherwin-tablet]', 'android');
do $$
begin
  assert (select user_id from push_tokens where token = 'ExponentPushToken[sherwin-tablet]')
         = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'token re-homed to the signed-in user';
  assert (select count(*) from push_tokens) = 1, 'nadia now owns exactly the tablet';
  raise notice 'PASS: register_push_token claims a device across accounts';
end $$;

reset role;
select 'ALL DB TESTS PASSED' as result;
