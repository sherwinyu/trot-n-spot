# Push notifications (SHE-133)

## Architecture

```
client writes row ──► Postgres AFTER trigger notify_push_event()
                          │  (pg_net: async HTTP, never blocks the write)
                          ▼
              edge function send-push-notification
                          │  policy.ts decides recipients + copy
                          │  loads push_tokens (service role), skips push_enabled=false
                          ▼
              Expo push API ──► APNs (iOS) / FCM (Android) ──► device
                          │
                          └─ DeviceNotRegistered tickets ⇒ token row deleted
```

Why server-side rather than the client posting to Expo: it works with the
offline mutation queue (fires when the write *lands*), recipients' tokens
never leave the server, and one file (`policy.ts`) owns the "who gets
notified" rules. Trade-offs: at-most-once delivery (no retries; the feed is
the source of truth) and debugging spans four systems — see
[Debugging](#debugging).

## Policy

| Event | Recipients | Copy | Tap → |
| --- | --- | --- | --- |
| targeted quest created | assignee | "Nadia spotted something" / description | `/quest/:id` |
| open quest created | every other active pack member | "Nadia spotted something" / description | `/quest/:id` |
| quest completed | creator | "Nadia found your quest" / description | `/quest/:id` |
| pack join | existing active members | "Nadia joined Dog Park Crew" | packs screen |

Not notified: someone else completing an open quest, quest edits, the
owner's own membership row from `create_pack`. Descriptions are clipped
to ~80 chars.

## Client behaviour

- **Permission**: never fires the system prompt cold. Our own explainer
  (`maybeAskForPush`) shows after the first pack create/join and, if
  declined, once more after the first quest is sent. After that, the
  Profile tab has "Enable notifications" (or "Open Settings" when denied).
- **Tokens**: one row per device in `push_tokens`; re-synced on every
  launch once permission is granted.
- **Mute**: `profiles.push_enabled` toggle on the Profile tab. Tokens stay
  registered so re-enabling is instant.
- **Foreground**: a push refetches the feed. The banner is suppressed
  only while the feed tab is focused.

## Hosted setup (done for `xbegbjicfgsozazlbysc`)

```bash
npx supabase db push                                         # migration 20260923230000
npx supabase secrets set PUSH_WEBHOOK_TOKEN=$(openssl rand -hex 32)
npx supabase functions deploy send-push-notification --no-verify-jwt --use-api
# app_config rows (same token as the secret):
#   push_webhook_url   = https://<ref>.supabase.co/functions/v1/send-push-notification
#   push_webhook_token = <token>
```

`--no-verify-jwt` is required because Postgres has no user JWT; the
bearer token above is the auth instead. `--use-api` bundles remotely
(no Docker needed).

## Android: Firebase / FCM (human steps)

Expo relays Android pushes through FCM, which needs a Firebase project.
Free (Spark plan, no card). ~15 minutes.

1. https://console.firebase.google.com → **Add project** → name
   `trotnspot` → disable Analytics → Create.
2. Project overview → **Add app → Android** → package name
   `xyz.sherwinyu.trotnspot` → Register → **Download google-services.json**.
   Skip the remaining SDK steps (Expo handles them).
3. Put the file at the repo root as `google-services.json` and commit it
   (it is not a secret — it ships inside every APK). `app.config.js`
   picks it up automatically.
4. Project settings (gear) → **Service accounts** → **Generate new
   private key** → save the JSON somewhere *outside* the repo.
5. In the repo: `eas credentials` → Android → (pick the build profile) →
   **Google Service Account** → **Manage your Google Service Account Key
   for Push Notifications (FCM V1)** → **Set up** → upload the JSON from
   step 4. Do this from your own terminal; it is interactive.
6. Rebuild the Android app (`google-services.json` is a native change):
   `eas build --profile preview --platform android`.

## Verifying on devices

1. Install a build on two phones, sign in as two members of one pack.
2. On phone A create a quest targeted at B → B gets a banner within a few
   seconds; tapping opens the quest. Create an open quest → B gets it too.
3. On B complete the quest → A gets "found your …".
4. Toggle "Pack activity pings" off on B, repeat step 2 → nothing.
5. Simulators do not receive pushes; the Android emulator does if it uses
   a Google Play image.

## Debugging

Follow the chain from the database outwards:

```sql
-- did the trigger enqueue a request?
select id, created from net.http_request_queue order by id desc limit 5;
-- what did the edge function answer?
select id, status_code, content::text from net._http_response order by id desc limit 5;
-- tokens registered per user
select user_id, platform, updated_at from push_tokens;
```

Then the function logs at
https://supabase.com/dashboard/project/xbegbjicfgsozazlbysc/functions.
The function returns `{ sent, recipients, pruned }` or
`{ skipped, reason }`; `reason: 'no push tokens'` means the client never
registered, `'recipients muted'` means everyone is muted. Send a
test push by hand from https://expo.dev/notifications with a token from
`push_tokens` to separate Expo/APNs problems from ours.
