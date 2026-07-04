-- DB-layer tests: RLS policies + RPC functions, run as the
-- `authenticated` role with auth.uid() faked via the JWT-claims GUC.
-- Every block raises on failure; a clean run prints only PASS notices.
\set ON_ERROR_STOP on

-- ============ helpers ============
create or replace function test_login(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id)::text, false)::void;
$$ language sql volatile;

-- ============ fixtures ============
-- Seeded users: a = Sherwin, b = Nadia (paired). Add two fresh users
-- for pairing tests and one stranger for RLS tests.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'test-carol@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Carol"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'test-dave@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Dave"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'test-eve@quest.dev', crypt('testpass123', gen_salt('bf')), now(), '{"full_name": "Eve"}'::jsonb, now(), now(), '', '', '', '');

-- storage objects matching one seeded quest, for storage RLS tests
insert into storage.objects (bucket_id, name)
values
  ('quest-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg');

-- ============ profile trigger ============
do $$
begin
  assert (select count(*) from profiles) = 5, 'expected 5 profiles (2 seeded + 3 new)';
  assert (select display_name from profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = 'Carol', 'display_name from metadata';
  assert (select pair_code from profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') ~ '^[0-9A-F]{6}$', 'pair code generated';
  raise notice 'PASS: handle_new_user trigger creates profiles with pair codes';
end $$;

-- ============ RLS as authenticated users ============
set role authenticated;

-- Sherwin sees his own + partner-related quests, not more
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  assert (select count(*) from quests) = 5, 'sherwin sees all 5 seeded quests (creator or assignee of each)';
  assert (select count(*) from profiles) = 2, 'sherwin sees only his own and partner profiles';
  raise notice 'PASS: participant sees own quests and own+partner profiles';
end $$;

-- A stranger sees nothing
select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
begin
  assert (select count(*) from quests) = 0, 'stranger sees no quests';
  assert (select count(*) from journeys) = 0, 'stranger sees no journeys';
  assert (select count(*) from profiles) = 1, 'stranger sees only own profile';
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

-- Quest INSERT: only as self
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
begin
  begin
    insert into quests (creator_id, assignee_id, photo_path)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'x/y/z.jpg');
    raise exception 'should not allow inserting quest as someone else';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS insert policy rejects
  end;
  raise notice 'PASS: cannot create quests impersonating another creator';
end $$;

-- ============ pair_with_partner RPC ============
select test_login('cccccccc-cccc-cccc-cccc-cccccccccccc');
do $$
declare
  dave_code text;
  result json;
begin
  reset role; -- look up fixture data as superuser
  select pair_code into dave_code from profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  set local role authenticated;

  -- invalid code
  result := pair_with_partner('ZZZZZZ');
  assert result ->> 'error' = 'Invalid pair code', 'invalid code rejected';

  -- self pair
  result := pair_with_partner((select pair_code from profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'));
  assert result ->> 'error' = 'Cannot pair with yourself', 'self pair rejected';

  -- valid pair
  result := pair_with_partner(dave_code);
  assert (result ->> 'success')::boolean, 'pairing succeeds';
  assert result ->> 'partner_name' = 'Dave', 'returns partner name';

  reset role;
  assert (select partner_id from profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'carol -> dave';
  assert (select partner_id from profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') = 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dave -> carol (mutual)';
  set local role authenticated;

  -- already paired
  result := pair_with_partner(dave_code);
  assert result ->> 'error' = 'You are already paired with a partner', 'repairing rejected';

  raise notice 'PASS: pair_with_partner (invalid, self, mutual, re-pair)';
end $$;

-- Eve cannot pair with already-paired Dave
select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
declare
  dave_code text;
  result json;
begin
  reset role;
  select pair_code into dave_code from profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  set local role authenticated;
  result := pair_with_partner(dave_code);
  assert result ->> 'error' = 'That user is already paired', 'pairing with taken user rejected';
  raise notice 'PASS: cannot pair with an already-paired user';
end $$;

-- ============ complete_quest RPC ============
-- Quest 1: creator = Nadia (b), assignee = Sherwin (a)

-- Creator cannot complete own quest
select test_login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
do $$
declare result json;
begin
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'b/1/completion.jpg', null);
  assert result ->> 'error' = 'Only the assignee can complete this quest', 'creator blocked from completing';
  raise notice 'PASS: only the assignee can complete a quest';
end $$;

-- Assignee completes it
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare result json;
begin
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/11111111-1111-1111-1111-111111111111/completion.jpg', null);
  assert (result ->> 'success')::boolean, 'assignee completes quest';

  assert (select status from quests where id = '11111111-1111-1111-1111-111111111111') = 'completed', 'status flipped';
  assert (select completed_at from quests where id = '11111111-1111-1111-1111-111111111111') is not null, 'completed_at set';

  -- double completion
  result := complete_quest('11111111-1111-1111-1111-111111111111', 'x.jpg', null);
  assert result ->> 'error' = 'Quest is already completed', 'double completion rejected';

  raise notice 'PASS: complete_quest (assignee success, status+timestamp, double-complete)';
end $$;

-- Unknown quest
do $$
declare result json;
begin
  result := complete_quest('99999999-9999-9999-9999-999999999999', 'x.jpg', null);
  assert result ->> 'error' = 'Quest not found', 'unknown quest error';
  raise notice 'PASS: complete_quest rejects unknown quest';
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

-- Assignee can read the creator's quest photo; stranger cannot
select test_login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  assert (select count(*) from storage.objects
          where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg') = 1,
    'assignee reads quest photo';
  raise notice 'PASS: assignee can read partner''s quest photo';
end $$;

select test_login('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
do $$
begin
  assert (select count(*) from storage.objects
          where name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg') = 0,
    'stranger cannot read quest photo';
  raise notice 'PASS: stranger cannot read quest photos';
end $$;

-- ============ push trigger resilience ============
reset role;
-- With webhook config present but pg_net absent, quest writes must
-- still succeed (warning, not error).
insert into app_config (key, value) values ('push_webhook_url', 'http://localhost:9999/functions/v1/send-push-notification');
do $$
begin
  insert into quests (creator_id, assignee_id, photo_path, description)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/trigger-test/original.jpg', 'trigger resilience test');
  raise notice 'PASS: quest insert survives push-webhook dispatch failure';
end $$;
delete from app_config where key = 'push_webhook_url';

reset role;
select 'ALL DB TESTS PASSED' as result;
