-- PostgREST clients connect as the `authenticated` role, which needs
-- table-level DML privileges IN ADDITION to RLS policies — RLS narrows what a
-- role may touch, it does not itself grant access. Migrations 001–003 enabled
-- RLS and defined policies on the app tables but never granted the underlying
-- privileges. The local db-test harness papered over this: its shim
-- (supabase/tests/supabase-shim.sql) runs
--   alter default privileges in schema public grant all on tables to authenticated;
-- BEFORE the migrations, so every table it later created was auto-granted.
--
-- A real Supabase project (local `supabase start` or the hosted project) never
-- runs that shim, so `authenticated` had only the non-DML defaults and every
-- PostgREST read/write failed with `permission denied for table profiles`
-- (SQLSTATE 42501). The app could not load a profile, so it fell back to the
-- "Pair with Partner" screen for already-paired users and showed no quests.
--
-- Grant the privileges explicitly so the app works on any Supabase instance.
-- RLS policies from earlier migrations still enforce per-row access.
--
-- app_config is deliberately excluded: it stores the push-webhook service-role
-- key and must remain invisible to clients. It keeps RLS enabled with no
-- policies and is read only by the SECURITY DEFINER trigger notify_quest_change.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.journeys to authenticated;
grant select, insert, update, delete on public.quests   to authenticated;
