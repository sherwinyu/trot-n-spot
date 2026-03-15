# Quest (Trot-n-Spot) MVP Implementation Plan

## Overview

An async scavenger hunt app for couples during dog walks. One partner photographs something interesting and assigns it as a "quest"; the other must find and photograph it on a future walk. Built with React Native/Expo, Supabase, and PowerSync for offline-first capability.

**Target users**: Sherwin + Nadia (two-player MVP, dev builds only)

---

## Phase 0: Project Setup and Scaffolding

**Goal**: Bootable Expo app with navigation skeleton, Supabase client, and dev tooling.

**Tasks**:
1. Initialize Expo project with `npx create-expo-app@latest trot-n-spot --template tabs` (Expo Router with file-based routing)
2. Install core dependencies:
   - `@supabase/supabase-js` — Supabase client
   - `@powersync/react-native` and `@powersync/attachments` — offline sync
   - `expo-camera` — quest photo capture
   - `expo-location` — GPS for quest creation
   - `expo-notifications` — push notifications
   - `expo-image-picker` — fallback photo selection
   - `expo-secure-store` — token storage for Supabase auth
   - `expo-updates` — OTA updates
   - `react-native-reanimated` — animations
   - `@expo/vector-icons` — iconography
3. Configure `app.json` / `app.config.ts`:
   - Bundle identifiers: `com.trotnspot.quest` (iOS + Android)
   - Set `expo-camera`, `expo-location`, `expo-notifications` permissions with user-facing descriptions
   - Configure `expo-updates` URL
   - Set `newArchEnabled: true`
4. Create `eas.json` for dev builds (development profile for iOS simulator + physical device, Android emulator + physical device)
5. Set up environment config:
   - `/config/supabase.ts` — Supabase URL + anon key (from env vars)
   - `/config/powersync.ts` — PowerSync instance URL
6. Establish directory structure (see below)
7. Set up ESLint + Prettier with Expo defaults
8. Create initial `CLAUDE.md` with project conventions

**Directory Structure**:
```
/app                    — Expo Router file-based routes
  /(auth)               — Auth screens (login, pairing)
    _layout.tsx
    login.tsx
    pair.tsx
  /(tabs)               — Main tab navigation
    _layout.tsx
    feed.tsx            — Active quest feed
    create.tsx          — Quest creation
    history.tsx         — Completed quests
    profile.tsx         — Settings/profile
  /quest
    [id].tsx            — Quest detail/completion screen
/components             — Shared UI components
  /ui                   — Generic UI primitives
  /quest                — Quest-specific components
  /camera               — Camera components
/lib                    — Business logic and services
  /supabase.ts          — Supabase client singleton
  /powersync.ts         — PowerSync setup and schema
  /auth.ts              — Auth helpers
  /notifications.ts     — Push notification helpers
  /location.ts          — Location helpers
/hooks                  — Custom React hooks
  /useAuth.ts
  /useQuests.ts
  /useJourney.ts
  /usePairStatus.ts
/providers              — React context providers
  /AuthProvider.tsx
  /PowerSyncProvider.tsx
  /NotificationProvider.tsx
/types                  — TypeScript type definitions
  /database.ts          — DB row types (mirrors Supabase schema)
  /quest.ts
  /journey.ts
/assets                 — Static assets (images, fonts)
/supabase               — Supabase project config
  /migrations           — SQL migration files
  /seed.sql             — Dev seed data
```

**Key files**: `app.config.ts`, `lib/supabase.ts`, `lib/powersync.ts`, all `_layout.tsx` files, `types/database.ts`

**Notes**:
- Use Expo Router v4 (file-based routing) — every file in `/app` is a route
- Tab layout uses `expo-router` `Tabs` component
- Auth guard logic lives in the root `_layout.tsx` — redirect to `/(auth)/login` if no session
- PowerSync provider wraps the entire app inside AuthProvider

---

## Phase 1: Database Schema Design (Supabase)

**Goal**: Fully defined PostgreSQL schema with RLS policies, storage buckets, and Edge Function stubs.

### Tables

**`profiles`** — Extended user info beyond Supabase `auth.users`

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | `uuid` | PK, references `auth.users(id)` on delete cascade | |
| `display_name` | `text` | not null | From Google profile |
| `avatar_url` | `text` | nullable | Google avatar |
| `partner_id` | `uuid` | nullable, references `profiles(id)` | Paired partner |
| `pair_code` | `text` | unique, not null | 6-char invite code |
| `push_token` | `text` | nullable | Expo push token |
| `created_at` | `timestamptz` | not null, default now() | |
| `updated_at` | `timestamptz` | not null, default now() | |

**`journeys`** — A single walk session

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | `uuid` | PK, default gen_random_uuid() | |
| `user_id` | `uuid` | not null, references `profiles(id)` | Who is walking |
| `started_at` | `timestamptz` | not null, default now() | |
| `ended_at` | `timestamptz` | nullable | Null while active |
| `created_at` | `timestamptz` | not null, default now() | |
| `updated_at` | `timestamptz` | not null, default now() | |

**`quests`** — A thing to find

| Column | Type | Constraints | Notes |
|--------|------|------------|-------|
| `id` | `uuid` | PK, default gen_random_uuid() | |
| `creator_id` | `uuid` | not null, references `profiles(id)` | Who created it |
| `assignee_id` | `uuid` | not null, references `profiles(id)` | Who must find it |
| `journey_id` | `uuid` | nullable, references `journeys(id)` | Journey during which it was created |
| `status` | `text` | not null, default 'active', check (status in ('active','completed')) | |
| `description` | `text` | nullable | Optional hint/description |
| `photo_path` | `text` | not null | Storage path to creator's photo |
| `location_lat` | `double precision` | nullable | Creator's GPS lat |
| `location_lng` | `double precision` | nullable | Creator's GPS lng |
| `completion_photo_path` | `text` | nullable | Assignee's found photo |
| `completion_journey_id` | `uuid` | nullable, references `journeys(id)` | Journey during which it was completed |
| `completed_at` | `timestamptz` | nullable | When assignee found it |
| `created_at` | `timestamptz` | not null, default now() | |
| `updated_at` | `timestamptz` | not null, default now() | |

### Storage Buckets

- **`quest-photos`** — All quest photos (creation + completion). Path convention: `{user_id}/{quest_id}/original.jpg` and `{user_id}/{quest_id}/completion.jpg`. Private bucket; access via signed URLs or RLS on storage.

### Row-Level Security Policies

**profiles**:
- SELECT: Users can read their own profile and their partner's profile
- UPDATE: Users can only update their own profile (`id = auth.uid()`)
- INSERT: Triggered via auth hook. Policy: `id = auth.uid()`

**journeys**:
- SELECT: Users can read their own journeys (`user_id = auth.uid()`)
- INSERT: Users can create their own journeys (`user_id = auth.uid()`)
- UPDATE: Users can update their own journeys (`user_id = auth.uid()`)

**quests**:
- SELECT: Users can read quests they created or are assigned to (`creator_id = auth.uid() OR assignee_id = auth.uid()`)
- INSERT: Users can create quests where they are the creator (`creator_id = auth.uid()`)
- UPDATE: Creator can update any field; assignee can only update `status`, `completion_photo_path`, `completion_journey_id`, `completed_at`

**quest-photos storage**:
- INSERT: Authenticated users can upload to their own folder
- SELECT: Users can read photos from quests they are creator or assignee of (use a SECURITY DEFINER function)

### Database Functions

- **`handle_new_user()`** — Trigger on `auth.users` INSERT: creates a `profiles` row, generates a random 6-char `pair_code`
- **`pair_with_partner(code text)`** — RPC function: looks up the pair_code, sets `partner_id` on both profiles (mutual). Returns error if code not found or already paired.
- **`complete_quest(quest_id uuid, photo_path text, journey_id uuid)`** — RPC function: validates assignee, sets status to 'completed', fills completion fields, returns updated quest.

### Migration Files

- `supabase/migrations/001_create_profiles.sql`
- `supabase/migrations/002_create_journeys.sql`
- `supabase/migrations/003_create_quests.sql`
- `supabase/migrations/004_create_storage_buckets.sql`
- `supabase/migrations/005_create_rls_policies.sql`
- `supabase/migrations/006_create_functions.sql`

**Notes**:
- Location privacy approach: Create a Postgres view `quests_secure` that returns `NULL` for `location_lat` and `location_lng` when the current user is the assignee. PowerSync syncs from this view rather than the raw table.
- Use `updated_at` columns with auto-update triggers for PowerSync change detection.

---

## Phase 2: Authentication Flow

**Goal**: Google Sign-In working, session persisted, auth state managed globally.

**Dependencies**: Phase 0, Phase 1

**Tasks**:
1. Configure Google OAuth in Supabase Dashboard (Google Cloud Console client IDs for iOS + Android + web)
2. Install `@react-native-google-signin/google-signin` for native Google Sign-In
3. Implement `lib/auth.ts`:
   - `signInWithGoogle()` — uses native Google Sign-In to get an ID token, then calls `supabase.auth.signInWithIdToken({ provider: 'google', token })`
   - `signOut()` — calls `supabase.auth.signOut()`
   - `getSession()` — returns current session
4. Implement `providers/AuthProvider.tsx`:
   - Wraps app in context providing `{ user, session, loading, signIn, signOut, profile, partner }`
   - Listens to `supabase.auth.onAuthStateChange` for session changes
   - On session established, fetches the user's `profiles` row (and partner profile if `partner_id` is set)
   - Stores session token in `expo-secure-store` for persistence across app restarts
5. Implement `app/_layout.tsx` root layout:
   - Wraps everything in `AuthProvider` > `PowerSyncProvider` > `NotificationProvider`
   - Redirects to `/(auth)/login` if unauthenticated
   - Redirects to `/(auth)/pair` if authenticated but no `partner_id`
   - Redirects to `/(tabs)/feed` if authenticated and paired
6. Implement `app/(auth)/login.tsx`:
   - Single "Sign in with Google" button
   - Shows loading spinner during auth flow
7. Configure `expo-secure-store` as the Supabase auth storage adapter

**Key files**: `lib/auth.ts`, `providers/AuthProvider.tsx`, `app/_layout.tsx`, `app/(auth)/login.tsx`

**Notes**:
- The `handle_new_user()` database trigger creates the profile automatically on first sign-in. No separate registration flow needed.
- Native Google Sign-In requires EAS dev builds (not Expo Go), so set up `eas build --profile development` early.

---

## Phase 3: Partner Pairing

**Goal**: Two users can pair with each other via an invite code.

**Dependencies**: Phase 2

**Tasks**:
1. Implement `app/(auth)/pair.tsx`:
   - Display the current user's `pair_code` prominently (large text, easy to read aloud or screenshot)
   - "Share Code" button using `Share` API
   - Input field for entering partner's code
   - "Pair" button that calls `supabase.rpc('pair_with_partner', { code })`
   - Handle success (redirect to feed) and error (code not found, already paired) states
2. Implement the `pair_with_partner` Supabase RPC function (in migration):
   - Validates the code exists and belongs to a different user
   - Checks neither user is already paired
   - Sets `partner_id` on both profiles in a single transaction
   - Returns success/error
3. After successful pairing, AuthProvider refetches profile to get `partner_id` and partner's display name

**Key files**: `app/(auth)/pair.tsx`, `supabase/migrations/006_create_functions.sql`, `providers/AuthProvider.tsx`

**Notes**:
- Pair code is generated once on profile creation: simple 6-character alphanumeric code (e.g., `UPPER(substr(md5(random()::text), 1, 6))`)
- Deep link pairing is a nice-to-have but not needed for MVP. Manual code entry is fine for two users.

---

## Phase 4: Journey Management

**Goal**: Users can start and end walk sessions. Quests are optionally tied to journeys.

**Dependencies**: Phase 2

**Tasks**:
1. Implement `hooks/useJourney.ts`:
   - `activeJourney` — current in-progress journey (where `ended_at IS NULL`)
   - `startJourney()` — inserts a new journey row
   - `endJourney()` — sets `ended_at` on the active journey
   - `journeyDuration` — computed from `started_at` to now (or `ended_at`)
2. Add journey controls to the tab layout:
   - When no active journey: "Start Walk" button (prominent)
   - When journey active: show elapsed timer, "End Walk" button
3. Journey state persists across app restarts (queried from database on load)

**Key files**: `hooks/useJourney.ts`, `app/(tabs)/_layout.tsx`

**Notes**:
- Journeys are optional in MVP. A user can create a quest without an active journey (`journey_id` is nullable).
- Keep the journey UI lightweight — a banner or floating pill showing "Walking — 23 min" is sufficient.
- Do not auto-start journeys based on location/movement. Manual start/stop only.

---

## Phase 5: Quest Creation Flow

**Goal**: User can photograph something, add a description, and assign it as a quest to their partner.

**Dependencies**: Phase 2, Phase 3, Phase 4 (optional)

**Tasks**:
1. Implement `app/(tabs)/create.tsx`:
   - Opens camera view immediately (or with a single tap)
   - After capture, shows preview with: description input, "Send Quest" button
   - On submit: uploads photo, creates quest row, triggers notification
2. Implement `components/camera/QuestCamera.tsx`:
   - Uses `expo-camera` with photo capture
   - Simple UI: capture button, flash toggle, flip camera
   - Returns the captured photo URI
3. Implement `hooks/useCreateQuest.ts`:
   - `createQuest({ photoUri, description })`:
     a. Get current location via `expo-location`
     b. Generate a quest ID (client-side UUID for offline support)
     c. Upload photo to Supabase Storage at `quest-photos/{user_id}/{quest_id}/original.jpg`
     d. Insert quest row with `creator_id = currentUser`, `assignee_id = partner_id`, `journey_id = activeJourney?.id`
     e. Return the created quest
4. Implement `lib/location.ts`:
   - `getCurrentLocation()` — requests `foregroundPermission`, returns `{ lat, lng }` or null
   - Only called during quest creation, not continuous tracking
5. Photo handling:
   - Resize/compress photo before upload (use `expo-image-manipulator` to resize to max 1200px width, 80% quality JPEG)

**Key files**: `app/(tabs)/create.tsx`, `components/camera/QuestCamera.tsx`, `hooks/useCreateQuest.ts`, `lib/location.ts`

**Notes**:
- Camera permission must be requested at runtime with a friendly explanation before the system prompt.
- Location is silently captured if permission was already granted; if not, prompt once. If denied, quest is created without location.
- `assignee_id` is always the partner (two-player). No picker needed.
- For offline support, the quest row is inserted locally via PowerSync and the photo is queued for upload via `@powersync/attachments`.

---

## Phase 6: Quest Feed and Browsing

**Goal**: Users see their active quests in a scrollable feed.

**Dependencies**: Phase 5

**Tasks**:
1. Implement `app/(tabs)/feed.tsx`:
   - Query active quests where `assignee_id = currentUser AND status = 'active'`
   - Also show a section for "Quests You Created" (active ones assigned to partner)
   - Pull-to-refresh
2. Implement `components/quest/QuestCard.tsx`:
   - Photo thumbnail (from Supabase Storage signed URL)
   - Description text (or placeholder)
   - Creator name and relative timestamp
   - Tap navigates to `app/quest/[id].tsx`
3. Implement `app/quest/[id].tsx` — Quest Detail screen:
   - Full-size photo
   - Description
   - Creator info
   - If assignee: "I Found It!" button to start completion flow
   - If creator: see status, no action needed
   - Do NOT show location to the assignee
4. Implement `hooks/useQuests.ts`:
   - `activeQuestsForMe` — quests assigned to me, status = active
   - `activeQuestsByMe` — quests I created, status = active
   - `completedQuests` — all completed quests (for history)
   - Uses PowerSync queries (local-first)

**Key files**: `app/(tabs)/feed.tsx`, `app/quest/[id].tsx`, `components/quest/QuestCard.tsx`, `hooks/useQuests.ts`

**Notes**:
- Generate signed URLs on-demand with short TTL (~1 hour). Cache client-side.
- Use `FlatList` with `keyExtractor` and `getItemLayout` for performance.
- Empty state: friendly message encouraging partner to create a quest, or prompt to create one yourself.

---

## Phase 7: Quest Completion Flow

**Goal**: Assignee can photograph the found item and mark the quest as completed.

**Dependencies**: Phase 6

**Tasks**:
1. Add completion flow to `app/quest/[id].tsx`:
   - "I Found It!" button opens camera (reuse `QuestCamera` component)
   - After capture, show side-by-side: original quest photo vs. completion photo
   - "Complete Quest" confirmation button
2. Implement `hooks/useCompleteQuest.ts`:
   - `completeQuest({ questId, photoUri })`:
     a. Upload completion photo to `quest-photos/{user_id}/{quest_id}/completion.jpg`
     b. Call `supabase.rpc('complete_quest', { quest_id, photo_path, journey_id })` or directly update the quest row
     c. Quest status changes to 'completed', `completed_at` set to now()
3. After completion:
   - Show a success celebration (simple animation)
   - Navigate back to feed (quest removed from active feed)
   - Trigger push notification to creator (handled server-side, Phase 8)

**Key files**: `app/quest/[id].tsx`, `hooks/useCompleteQuest.ts`

**Notes**:
- Side-by-side photo comparison: two images stacked or side by side with a divider.
- `complete_quest` RPC validates that the caller is the assignee.
- Consider revealing the original quest's location to the assignee after completion as a fun reveal moment.

---

## Phase 8: Push Notifications

**Goal**: Notify partner when a new quest is assigned or completed.

**Dependencies**: Phase 2, Phase 5, Phase 7

**Tasks**:
1. Implement `lib/notifications.ts`:
   - `registerForPushNotifications()` — requests permission, gets Expo push token, saves to `profiles.push_token`
   - `handleNotificationReceived(notification)` — handles foreground notifications
   - `handleNotificationResponse(response)` — handles notification taps (deep link to quest)
2. Implement `providers/NotificationProvider.tsx`:
   - Registers for push on mount (after auth)
   - Sets up notification listeners
   - Configures notification handler (show alerts when app is foregrounded)
3. Create Supabase Edge Function `send-push-notification`:
   - Triggered by database webhook on `quests` table (INSERT or UPDATE where status changes)
   - On INSERT (new quest): send push to `assignee_id`'s push token. Title: "New Quest!", Body: description or "Your partner found something for you to find!"
   - On UPDATE to 'completed': send push to `creator_id`'s push token. Title: "Quest Completed!", Body: "Your partner found it!"
   - Uses Expo Push API (`https://exp.host/--/api/v2/push/send`)
4. Configure Supabase Database Webhooks:
   - Webhook on `quests` INSERT -> Edge Function
   - Webhook on `quests` UPDATE (status changed to 'completed') -> Edge Function
5. Add deep linking config so notification taps navigate to the relevant quest:
   - Notification payload includes `quest_id`
   - `handleNotificationResponse` navigates to `/quest/{quest_id}`

**Key files**: `lib/notifications.ts`, `providers/NotificationProvider.tsx`, `supabase/functions/send-push-notification/index.ts`

**Notes**:
- Expo push notifications require a physical device (not simulator).
- Push is "best effort" — if the user is offline when the notification fires, Expo/APNs/FCM handle delivery when device comes online.
- Alternative to database webhooks: Postgres trigger that calls `pg_net` to invoke the Edge Function.
- Edge Function uses Deno runtime (Supabase default).

---

## Phase 9: History View

**Goal**: Browsable archive of completed quests with metadata.

**Dependencies**: Phase 7

**Tasks**:
1. Implement `app/(tabs)/history.tsx`:
   - Query completed quests, sorted by `completed_at` descending
   - Gallery-style grid layout (2 columns) showing quest photos
   - Each item shows: creation photo thumbnail, completion photo thumbnail, time-to-find duration
2. Implement `components/quest/HistoryCard.tsx`:
   - Two photos side by side (creation + completion)
   - Metadata: creator name, date created, date completed, time-to-find
   - Tap opens detail view
3. Quest detail for completed quests (reuse `app/quest/[id].tsx`):
   - Show both photos
   - Show full metadata including timestamps
   - If creator: now show location (both users can see it after completion)
   - Show which journeys the quest was part of
4. Compute "time-to-find" as `completed_at - created_at`, formatted as human-readable duration ("2 hours", "3 days", etc.)

**Key files**: `app/(tabs)/history.tsx`, `components/quest/HistoryCard.tsx`, `app/quest/[id].tsx` (extended)

**Notes**:
- Use pagination or infinite scroll (`FlatList` with `onEndReached`).
- Cache photo thumbnails aggressively for history since these never change.

---

## Phase 10: Offline Sync with PowerSync

**Goal**: App works fully offline; syncs when connectivity is restored.

**Dependencies**: Phase 1, Phase 2. Should be integrated during Phases 5-9 rather than bolted on after.

**Tasks**:
1. Set up PowerSync service:
   - Create PowerSync instance (cloud hosted at powersync.com or self-hosted)
   - Configure connection to Supabase database
   - Set up sync rules (which tables/columns sync to which users)
2. Implement `lib/powersync.ts`:
   - Define PowerSync schema mirroring the Supabase tables
   - Create PowerSync database instance with `PowerSyncDatabase`
   - Implement `SupabaseConnector` class:
     - `fetchCredentials()` — returns Supabase JWT for PowerSync auth
     - `uploadData(database)` — handles uploading local changes to Supabase
3. Implement `providers/PowerSyncProvider.tsx`:
   - Initializes PowerSync after auth session is established
   - Provides PowerSync database instance via context
   - Handles connection lifecycle (connect on auth, disconnect on sign out)
4. Define PowerSync sync rules:
   ```yaml
   bucket_definitions:
     user_quests:
       parameters: SELECT id AS user_id FROM profiles WHERE id = token_parameters.user_id
       data:
         - SELECT id, creator_id, assignee_id, journey_id, status, description, photo_path,
                  CASE WHEN assignee_id = token_parameters.user_id THEN NULL ELSE location_lat END AS location_lat,
                  CASE WHEN assignee_id = token_parameters.user_id THEN NULL ELSE location_lng END AS location_lng,
                  completion_photo_path, completion_journey_id, completed_at, created_at, updated_at
           FROM quests
           WHERE creator_id = token_parameters.user_id OR assignee_id = token_parameters.user_id
     user_journeys:
       parameters: SELECT id AS user_id FROM profiles WHERE id = token_parameters.user_id
       data:
         - SELECT * FROM journeys WHERE user_id = token_parameters.user_id
     user_profiles:
       parameters: SELECT id AS user_id FROM profiles WHERE id = token_parameters.user_id
       data:
         - SELECT id, display_name, avatar_url, partner_id, pair_code, created_at, updated_at
           FROM profiles
           WHERE id = token_parameters.user_id
              OR id = (SELECT partner_id FROM profiles WHERE id = token_parameters.user_id)
   ```
5. Update all hooks to use PowerSync queries instead of direct Supabase queries:
   - Read operations: `usePowerSyncWatchedQuery(sql)` for reactive queries
   - Write operations: `db.execute(sql)` for local writes (PowerSync handles upload)
6. Implement photo attachment handling with `@powersync/attachments`:
   - Queue photos for upload when offline
   - Track upload status (pending, uploaded, failed)
   - Display local photo URI while upload is pending

**Key files**: `lib/powersync.ts`, `providers/PowerSyncProvider.tsx`, PowerSync sync rules YAML, all hooks updated

**Notes**:
- PowerSync sync rules enforce location privacy at the sync layer. The `CASE WHEN` ensures assignees never receive location data locally.
- The `uploadData` method must handle conflicts gracefully. For two players, conflicts are rare.
- Photo uploads happen via the attachment queue, separate from row sync.
- PowerSync uses SQLite locally, so queries use SQLite syntax.
- Start this phase early (during Phase 5) to avoid a painful migration later.

---

## Phase 11: Location Handling

**Goal**: Capture location on quest creation, enforce privacy, optional reveal on completion.

**Dependencies**: Phase 5

**Tasks**:
1. `lib/location.ts` implementation:
   - `requestLocationPermission()` — requests foreground permission with explanation
   - `getCurrentLocation()` — returns `{ lat, lng, accuracy }` or null. Uses `Location.getCurrentPositionAsync` with `Accuracy.Balanced`
   - No background location tracking — foreground, one-shot capture only
2. Integrate into quest creation:
   - Call `getCurrentLocation()` during quest creation
   - Store in quest row's `location_lat`, `location_lng`
   - If permission denied, create quest without location (fields remain null)
3. Privacy enforcement (layered):
   - **Database layer**: PowerSync sync rules strip location for assignees
   - **Client layer**: Quest detail screen does not render location for assignee
   - **Post-completion**: After quest is completed, location can optionally be revealed to both users
4. Optional: Show location on a map in quest detail (for creator, or for both after completion):
   - Use `react-native-maps` (MapView with a single marker)
   - Nice-to-have for MVP; can display as text coordinates initially

**Key files**: `lib/location.ts`, `app/quest/[id].tsx` (conditional rendering)

**Notes**:
- Do NOT use background location. Keeps things simple and respects battery life.
- `Accuracy.Balanced` gives ~100m accuracy — fine for neighborhood-scale quests.
- Triple-layer privacy (sync rules, database view, client check) ensures location never leaks to the assignee before completion.

---

## Build and Deployment

**Ongoing throughout development.**

1. Configure EAS Build profiles in `eas.json`:
   - `development` — dev client with debugging
   - `preview` — internal testing without dev tools
2. Build dev clients:
   - `eas build --profile development --platform ios`
   - `eas build --profile development --platform android`
3. Configure `expo-updates` for OTA updates (avoids rebuilding for JS-only changes)
4. Supabase project setup:
   - Create Supabase project
   - Run migrations
   - Configure Google OAuth provider
   - Deploy Edge Functions
   - Set up PowerSync integration (add PowerSync's database role)

---

## Recommended Build Order

Sequenced based on dependencies:

| Order | Phase | Description | Est. Day |
|-------|-------|-------------|----------|
| 1 | Phase 0 | Project scaffolding | 1 |
| 2 | Phase 1 | Database schema | 1-2 |
| 3 | Phase 2 | Authentication | 2-3 |
| 4 | Phase 3 | Partner pairing | 3 |
| 5 | Phase 10 (partial) | PowerSync setup and provider | 3-4 |
| 6 | Phase 4 | Journey management | 4 |
| 7 | Phase 5 | Quest creation | 4-5 |
| 8 | Phase 11 | Location handling | 5 |
| 9 | Phase 6 | Quest feed | 5-6 |
| 10 | Phase 7 | Quest completion | 6 |
| 11 | Phase 8 | Push notifications | 6-7 |
| 12 | Phase 9 | History view | 7 |
| 13 | Phase 10 (complete) | Full offline sync integration | 7-8 |

---

## Key Technical Decisions

1. **PowerSync vs. direct Supabase queries**: PowerSync adds complexity but gives true offline-first. For a dog-walking app where you're often in areas with poor signal, this is essential. Set it up from the start.

2. **Single `quests` table vs. separate `quest_assignments`**: For two players, a single table with `creator_id` and `assignee_id` is simpler. Normalize later if expanding to groups.

3. **Supabase Edge Functions for push vs. client-side push**: Server-side is more reliable and avoids the sender needing to know the recipient's push token. Also fires even if the sender goes offline immediately after creating the quest.

4. **No background location**: Keeps the app simple, respects battery life, and avoids permission escalation.

5. **Dev builds only**: No App Store review concerns. Use EAS dev builds and `expo-updates` for quick iteration.

6. **Photo storage in Supabase Storage**: Sufficient for two users. Compressed photos are ~200-400KB each. Storage costs are negligible.

---

## Critical Files

| File | Why It Matters |
|------|---------------|
| `lib/powersync.ts` | Core offline-first sync setup; everything depends on it |
| `supabase/migrations/003_create_quests.sql` | Central data model; schema drives the entire feature set |
| `providers/AuthProvider.tsx` | Gates the entire app; manages session, profile, partner state |
| `hooks/useCreateQuest.ts` | Most complex user flow: camera + location + upload + DB write |
| `app/quest/[id].tsx` | Dual-purpose screen (viewing + completing) with location privacy |
