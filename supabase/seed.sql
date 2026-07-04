-- Seed data for local development
-- Creates two test users in a shared pack, plus sample quests
-- (targeted both ways, one open-to-the-pack, two completed).
-- Run with: npx supabase db reset

-- Create test users in auth.users (Supabase local dev)
-- The handle_new_user() trigger will auto-create profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'test-sherwin@quest.dev',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"full_name": "Sherwin", "avatar_url": null}'::jsonb,
  now(), now(), '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'test-nadia@quest.dev',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"full_name": "Nadia", "avatar_url": null}'::jsonb,
  now(), now(), '', '', '', ''
);

-- Their shared pack, with a stable invite code for manual testing.
insert into packs (id, name, owner_id)
values (
  'facadefa-cade-4ace-8ade-000000000001',
  'Sherwin & Nadia',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

insert into pack_members (pack_id, user_id, role) values
  ('facadefa-cade-4ace-8ade-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
  ('facadefa-cade-4ace-8ade-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member');

insert into pack_invites (pack_id, code, created_by)
values ('facadefa-cade-4ace-8ade-000000000001', 'WOOF01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Create sample quests
insert into quests (id, pack_id, creator_id, assignee_id, mode, status, description, photo_path, created_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'facadefa-cade-4ace-8ade-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'targeted',
    'active',
    'Find this cool mural on Oak Street',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg',
    now() - interval '2 hours'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'facadefa-cade-4ace-8ade-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'targeted',
    'active',
    'Spot the fire hydrant shaped like a dalmatian',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/22222222-2222-2222-2222-222222222222/original.jpg',
    now() - interval '1 day'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'facadefa-cade-4ace-8ade-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'targeted',
    'active',
    'The blue bench near the dog park',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/33333333-3333-3333-3333-333333333333/original.jpg',
    now() - interval '30 minutes'
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'facadefa-cade-4ace-8ade-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    null,
    'open',
    'active',
    'Open hunt: the little free library with the red door',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/66666666-6666-6666-6666-666666666666/original.jpg',
    now() - interval '4 hours'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'facadefa-cade-4ace-8ade-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'targeted',
    'completed',
    'The big oak tree in the park',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/44444444-4444-4444-4444-444444444444/original.jpg',
    now() - interval '3 days'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'facadefa-cade-4ace-8ade-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'targeted',
    'completed',
    'The funny garden gnome on Elm St',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/55555555-5555-5555-5555-555555555555/original.jpg',
    now() - interval '5 days'
  );

-- Add completion data for completed quests
update quests set
  finder_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  completion_photo_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/44444444-4444-4444-4444-444444444444/completion.jpg',
  completed_at = created_at + interval '4 hours'
where id = '44444444-4444-4444-4444-444444444444';

update quests set
  finder_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  completion_photo_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/55555555-5555-5555-5555-555555555555/completion.jpg',
  completed_at = created_at + interval '2 days'
where id = '55555555-5555-5555-5555-555555555555';
