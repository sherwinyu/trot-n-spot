-- A push token identifies a device, not a person. When a second account
-- signs in on the same phone its upsert would hit the previous owner's
-- row, which RLS (rightly) forbids. Holding the token proves you hold the
-- device, so re-homing it to the caller is safe; do it in a definer RPC.

create or replace function register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) = 0 then
    raise exception 'token required';
  end if;

  insert into push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

grant execute on function register_push_token(text, text) to authenticated;
