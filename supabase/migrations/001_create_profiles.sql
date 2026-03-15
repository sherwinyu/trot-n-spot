-- Create updated_at trigger function (shared across tables)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Profiles table
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  partner_id uuid references profiles(id),
  pair_code text unique not null,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;

create policy "Users can read own and partner profile"
  on profiles for select
  using (
    id = auth.uid()
    or id = (select partner_id from profiles where id = auth.uid())
  );

create policy "Users can insert own profile"
  on profiles for insert
  with check (id = auth.uid());

create policy "Users can update own profile"
  on profiles for update
  using (id = auth.uid());

-- Auto-update updated_at
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();
