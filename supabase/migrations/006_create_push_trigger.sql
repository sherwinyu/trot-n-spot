-- Push notification trigger: on quest insert or completion, POST a
-- webhook-style payload to the send-push-notification edge function
-- via pg_net.
--
-- Configuration lives in app_config so the same migration works in
-- every environment. In production, set:
--   insert into app_config (key, value) values
--     ('push_webhook_url', 'https://<project-ref>.supabase.co/functions/v1/send-push-notification'),
--     ('push_webhook_token', '<service role key>');
-- If config (or pg_net) is missing, the trigger silently no-ops —
-- notifications are best-effort and must never block quest writes.

create table if not exists app_config (
  key text primary key,
  value text not null
);

alter table app_config enable row level security;
-- No policies: app_config is service-role/trigger-only, invisible to clients.

create or replace function notify_quest_change()
returns trigger as $$
declare
  webhook_url text;
  webhook_token text;
begin
  select value into webhook_url from app_config where key = 'push_webhook_url';
  select value into webhook_token from app_config where key = 'push_webhook_token';

  if webhook_url is null then
    return new;
  end if;

  -- Only fire on insert, or on the transition to completed.
  if tg_op = 'UPDATE' and (new.status != 'completed' or old.status = 'completed') then
    return new;
  end if;

  begin
    perform net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(webhook_token, '')
      ),
      body := jsonb_build_object(
        'type', tg_op,
        'record', to_jsonb(new),
        'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
      )
    );
  exception when others then
    -- pg_net missing or request queueing failed; never block the write.
    raise warning 'push notification dispatch failed: %', sqlerrm;
  end;

  return new;
end;
$$ language plpgsql security definer;

create trigger quests_notify_push
  after insert or update on quests
  for each row execute function notify_quest_change();
