-- Seed data for local development
-- Creates two test users, pairs them, and adds sample quests.
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

-- Wait for trigger to create profiles, then pair them
update profiles
set partner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

update profiles
set partner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Create sample quests
insert into quests (id, creator_id, assignee_id, status, description, photo_path, created_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'active',
    'Find this cool mural on Oak Street',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/11111111-1111-1111-1111-111111111111/original.jpg',
    now() - interval '2 hours'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'active',
    'Spot the fire hydrant shaped like a dalmatian',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/22222222-2222-2222-2222-222222222222/original.jpg',
    now() - interval '1 day'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'active',
    'The blue bench near the dog park',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/33333333-3333-3333-3333-333333333333/original.jpg',
    now() - interval '30 minutes'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'completed',
    'The big oak tree in the park',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/44444444-4444-4444-4444-444444444444/original.jpg',
    now() - interval '3 days'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'completed',
    'The funny garden gnome on Elm St',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/55555555-5555-5555-5555-555555555555/original.jpg',
    now() - interval '5 days'
  );

-- Add completion data for completed quests
update quests set
  completion_photo_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/44444444-4444-4444-4444-444444444444/completion.jpg',
  completed_at = created_at + interval '4 hours'
where id = '44444444-4444-4444-4444-444444444444';

update quests set
  completion_photo_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/55555555-5555-5555-5555-555555555555/completion.jpg',
  completed_at = created_at + interval '2 days'
where id = '55555555-5555-5555-5555-555555555555';
