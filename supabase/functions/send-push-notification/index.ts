// Sends Expo push notifications when quests change.
//
// Invoked by the database trigger in migration 006 (via pg_net) with a
// Supabase webhook-style payload:
//   { type: 'INSERT' | 'UPDATE', record: <quest row>, old_record?: <quest row> }
//
// - INSERT           -> notify the assignee ("New Quest!")
// - UPDATE completed -> notify the creator ("Quest Completed!")
//
// Delivery is best-effort: failures are logged, never retried. If a push
// is missed the quest still appears in the feed on next refresh.

import { createClient } from 'npm:@supabase/supabase-js@2';

type QuestRecord = {
  id: string;
  creator_id: string;
  assignee_id: string;
  status: string;
  description: string | null;
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: QuestRecord;
  old_record?: QuestRecord;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const payload: WebhookPayload = await req.json();
  const { type, record, old_record } = payload;

  let recipientId: string | null = null;
  let title = '';
  let body = '';

  if (type === 'INSERT') {
    recipientId = record.assignee_id;
    title = 'New Quest!';
    body = record.description || 'Your partner spotted something for you to find';
  } else if (
    type === 'UPDATE' &&
    record.status === 'completed' &&
    old_record?.status !== 'completed'
  ) {
    recipientId = record.creator_id;
    title = 'Quest Completed!';
    body = 'Your partner found it!';
  }

  if (!recipientId) {
    return Response.json({ skipped: true });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', recipientId)
    .single();

  if (!profile?.push_token) {
    return Response.json({ skipped: true, reason: 'no push token' });
  }

  const pushResponse = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.push_token,
      title,
      body,
      data: { questId: record.id },
    }),
  });

  const pushResult = await pushResponse.json();
  if (!pushResponse.ok) {
    console.error('Expo push failed', pushResult);
  }

  return Response.json({ sent: pushResponse.ok, pushResult });
});
