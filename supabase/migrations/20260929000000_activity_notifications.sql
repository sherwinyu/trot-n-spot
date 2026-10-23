-- Persisted activity feed: one row per recipient per notifiable event.
--
-- Rows are written by the send-push-notification edge function (service
-- role) right before it pushes, so the in-app feed and the push always
-- describe the same events with the same copy. Muted users
-- (profiles.push_enabled = false) still get feed rows; they only skip the
-- push. Clients read their own rows and mark them read via an RPC.

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  type text not null check (type in ('quest_created', 'quest_completed', 'pack_joined')),
  quest_id uuid references quests(id) on delete cascade,
  pack_id uuid references packs(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy "Users read own notifications"
  on notifications for select
  using (user_id = auth.uid());

grant select on public.notifications to authenticated;

-- Marks every unread notification of the caller as read. An RPC rather
-- than an update policy so clients can only ever flip read_at, never edit
-- the event itself.
create or replace function mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
$$;

grant execute on function mark_notifications_read() to authenticated;
