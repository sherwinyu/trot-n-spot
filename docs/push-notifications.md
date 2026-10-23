# Push notifications (SHE-133)

## Architecture

```
client writes row ──► Postgres AFTER trigger notify_push_event()
                          │  (pg_net: async HTTP, never blocks the write)
                          ▼
              edge function send-push-notification
                          │  policy.ts decides recipients + copy
                          │  inserts one `notifications` row per recipient (Activity feed)
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
| quest comment | quest creator, assignee, finder, and earlier commenters still in the pack | "Nadia commented" / comment | `/quest/:id` |

Not notified: someone else completing an open quest, quest edits, the
owner's own membership row from `create_pack`, reactions, comment deletes. Descriptions are clipped
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
- **Activity feed**: every event that would push is also persisted to
  `notifications` (same title/body, even for muted users). The History tab
  lists them above completed quests; the tab badge shows the unread count
  and opening the tab calls `mark_notifications_read()`. Rows are
  read-only for clients (select-only RLS; the edge function writes with
  the service role). Events before this shipped have no rows.

## Local walk reminders (SHE-220)

These are opt-in, on-device notifications, independent of pack activity pings.
Profile → Walk reminders defaults to 07:00 and 16:00 local time; editable within
07:00–10:00 and 16:00–19:00 (exclusive end). No location or motion permission,
new native dependency, server job, or database migration is needed.

- A normal notification tap opens Profile. The explicit **Start Walk** action
  starts a journey. **Remind in 30 min** stays within that window; **Skip today**
  skips both remaining windows today. All actions open the app, including on a
  cold start, rather than requiring background JavaScript execution.
- Manual Start/End and notification starts share `JourneyProvider`. A walk can
  also start 10/20/30 minutes ago, unless that overlaps a previous walk. Saving
  walks requires connectivity; failures are shown, not silently queued.
- Scheduling uses 28 days of one-shot requests (at most 56, below iOS's 64
  pending-request limit). This lets us cancel today's reminders without losing
  tomorrow's. Opening/foregrounding the app renews the horizon and checks recent
  walks. If the app is unused for four weeks, reminders stop until it is opened.
- Active walks cancel pending reminders; ending the walk refills the schedule,
  excluding today's windows in which a walk was logged. Other-device walks are
  noticed on foreground, not while this device is asleep.
- Settings are account-scoped in local storage and do not sync between phones.
  Logout/account switch removes the previous account's pending and displayed
  reminders. Permission revocation is reconciled on foreground.
- Dates follow the device's local calendar, including DST. Reopen after changing
  time zones to rebuild the schedule. Android battery restrictions and iOS Focus
  can delay/silence delivery; exact-alarm permission is deliberately not added.

### Device checks

1. In a morning/evening window, set the relevant reminder a few minutes ahead,
   enable reminders, and background the app. Check banner/actions on both phones.
2. Use **Start Walk** with the app terminated; check one active walk and timer.
   A normal banner tap should only open Profile, not start anything.
3. Snooze, reopen, and verify the new reminder; skip today and check tomorrow
   remains scheduled. Snoozing past the window should not schedule a late ping.
4. Log/end a walk before a later reminder in the same window; it should not fire.
5. Disable reminders, revoke permission, and sign out; check pending reminders
   are canceled without affecting pack notifications. Re-enable after returning.
6. Try a backdated start, then an overlapping start; only the valid one should
   save. Check offline errors and that the normal Start/End flow still works.

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
