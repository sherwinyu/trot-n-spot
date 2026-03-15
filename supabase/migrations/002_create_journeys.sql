create table journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table journeys enable row level security;

create policy "Users can read own journeys"
  on journeys for select
  using (user_id = auth.uid());

create policy "Users can insert own journeys"
  on journeys for insert
  with check (user_id = auth.uid());

create policy "Users can update own journeys"
  on journeys for update
  using (user_id = auth.uid());

create trigger journeys_updated_at
  before update on journeys
  for each row execute function update_updated_at();
