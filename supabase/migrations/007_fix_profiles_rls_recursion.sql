-- The original "read own and partner profile" policy subqueried
-- profiles from within its own SELECT policy, which Postgres rejects
-- with "infinite recursion detected in policy" the moment any profile
-- row is read. Route the partner lookup through a security definer
-- function so it bypasses RLS instead of re-triggering it.

create or replace function get_partner_id(user_id uuid)
returns uuid
security definer
set search_path = public
as $$
  select partner_id from profiles where id = user_id;
$$ language sql stable;

drop policy "Users can read own and partner profile" on profiles;

create policy "Users can read own and partner profile"
  on profiles for select
  using (
    id = auth.uid()
    or id = get_partner_id(auth.uid())
  );
