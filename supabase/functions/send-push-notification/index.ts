// Sends Expo push notifications for quest and pack activity.
//
// Invoked by the database trigger notify_push_event() (via pg_net) with a
// Supabase webhook-style payload:
//   { type, table, record, old_record? }
//
// Recipient/copy policy lives in policy.ts (pure, unit-tested):
//   quests INSERT (targeted)     -> assignee
//   quests INSERT (open)         -> every other active pack member
//   quests UPDATE -> completed   -> creator
//   pack_members INSERT (member) -> every other active pack member
//
// Recipients with profiles.push_enabled = false are skipped. Every device
// token of each recipient gets the message; tokens Expo reports as
// DeviceNotRegistered are deleted.
//
// The function is deployed with JWT verification off (Postgres has no user
// JWT); instead the trigger sends app_config.push_webhook_token as a bearer
// token, checked against the PUSH_WEBHOOK_TOKEN function secret.
//
// Delivery is best-effort: failures are logged, never retried. If a push
// is missed the activity still appears in the feed on next refresh.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  deadTokens,
  describeEvent,
  planNotification,
  type ExpoPushTicket,
  type WebhookPayload,
} from './policy.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const expected = Deno.env.get('PUSH_WEBHOOK_TOKEN');
  if (expected && req.headers.get('Authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload: WebhookPayload = await req.json();

  const event = describeEvent(payload);
  if (!event) {
    return Response.json({ skipped: true, reason: 'event not notifiable' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const [{ data: actor }, { data: pack }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', event.actorId).maybeSingle(),
    supabase.from('packs').select('name').eq('id', event.packId).maybeSingle(),
    supabase
      .from('pack_members')
      .select('user_id')
      .eq('pack_id', event.packId)
      .eq('status', 'active'),
  ]);

  const plan = planNotification(payload, {
    actorName: actor?.display_name ?? null,
    packName: pack?.name ?? null,
    packMemberIds: (members ?? []).map((m: { user_id: string }) => m.user_id),
  });

  if (!plan || plan.recipientIds.length === 0) {
    return Response.json({ skipped: true, reason: 'no recipients' });
  }

  const { data: enabled } = await supabase
    .from('profiles')
    .select('id')
    .in('id', plan.recipientIds)
    .eq('push_enabled', true);
  const enabledIds = (enabled ?? []).map((p: { id: string }) => p.id);
  if (enabledIds.length === 0) {
    return Response.json({ skipped: true, reason: 'recipients muted' });
  }

  const { data: tokenRows } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', enabledIds);
  const tokens = (tokenRows ?? []).map((t: { token: string }) => t.token);
  if (tokens.length === 0) {
    return Response.json({ skipped: true, reason: 'no push tokens' });
  }

  const pushResponse = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: plan.title,
        body: plan.body,
        sound: 'default',
        data: plan.data,
      }))
    ),
  });

  const pushResult = await pushResponse.json();
  if (!pushResponse.ok) {
    console.error('Expo push failed', pushResult);
    return Response.json({ sent: false, pushResult }, { status: 502 });
  }

  const tickets: ExpoPushTicket[] = Array.isArray(pushResult?.data) ? pushResult.data : [];
  const dead = deadTokens(tokens, tickets);
  if (dead.length > 0) {
    await supabase.from('push_tokens').delete().in('token', dead);
  }

  return Response.json({
    sent: tickets.filter((t) => t.status === 'ok').length,
    prunedTokens: dead.length,
    recipients: enabledIds.length,
  });
});
