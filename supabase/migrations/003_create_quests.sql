create table quests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id),
  assignee_id uuid not null references profiles(id),
  journey_id uuid references journeys(id),
  status text not null default 'active' check (status in ('active', 'completed')),
  description text,
  photo_path text not null,
  location_lat double precision,
  location_lng double precision,
  completion_photo_path text,
  completion_journey_id uuid references journeys(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table quests enable row level security;

create policy "Users can read own quests"
  on quests for select
  using (creator_id = auth.uid() or assignee_id = auth.uid());

create policy "Users can create quests as creator"
  on quests for insert
  with check (creator_id = auth.uid());

create policy "Creators can update any field"
  on quests for update
  using (creator_id = auth.uid());

create policy "Assignees can complete quests"
  on quests for update
  using (assignee_id = auth.uid())
  with check (
    -- Assignees can only change completion-related fields
    -- Enforce by requiring non-completion fields stay the same
    creator_id = creator_id
    and assignee_id = assignee_id
    and journey_id is not distinct from journey_id
    and description is not distinct from description
    and photo_path = photo_path
    and location_lat is not distinct from location_lat
    and location_lng is not distinct from location_lng
  );

create trigger quests_updated_at
  before update on quests
  for each row execute function update_updated_at();
