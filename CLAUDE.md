# Quest (Trot-n-Spot)

Async scavenger hunt app for couples during dog walks. React Native/Expo + Supabase.

## Project Structure

See `MVP_PLAN.md` for full architecture, database schema, and phased build order.

## Tech Stack

- **Client**: React Native + Expo (Expo Router v4, file-based routing)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Offline**: lightweight mutation queue + feed cache (`lib/offline.ts`, `lib/sync.ts`) — deliberately no PowerSync
- **Auth**: Supabase Auth (dev email login; Google OAuth planned)
- **Push**: Expo Notifications (DB trigger → edge function → Expo push API)
- **E2E Testing**: Playwright web E2E (`e2e/run-e2e.js`) + Maestro on device
- **Unit Testing**: Jest; DB tests via `scripts/db-test.sh` (plain Postgres, no Docker)

## Commands

Always source the env first in agent bash calls:

```bash
source scripts/env.sh   # Sets up nvm, ANDROID_HOME, JAVA_HOME, PATH
```

```bash
# Dev
npx expo start                    # Start Metro bundler
npx expo start --android          # Start and open on Android
npx expo start --web              # Start web preview at localhost:8081

# Build (run in background — takes ~10 min)
eas build --profile development --platform android --local --output ./build-output/app.apk --non-interactive

# Test
npx jest                          # Unit + component tests
npx jest --watch                  # Watch mode
scripts/db-test.sh                # Migrations + RLS + RPC tests (plain Postgres, no Docker)
node e2e/run-e2e.js               # Browser E2E: full two-user flow vs mock Supabase (real Postgres RLS)
maestro test .maestro/            # On-device E2E flows (needs emulator + local Supabase)
maestro test .maestro/full-smoke.yaml  # Smoke test

# Supabase (local)
npx supabase start                # Start local Supabase
npx supabase db reset             # Reset + re-seed database
npx supabase db push              # Push migrations to remote

# Android emulator
emulator -avd quest-test -no-window -no-audio -gpu swiftshader_indirect &
adb wait-for-device
adb exec-out screencap -p > screen.png   # Screenshot
```

## Conventions

- All routes live in `/app` (Expo Router file-based routing)
- Business logic in `/hooks` and `/lib`, not in components
- Reads go through Supabase with a cached last-good copy (`useQuests`); offline writes queue in `lib/offline.ts` and replay via `SyncProvider`
- Location fields are NEVER exposed to quest assignees — always select `QUEST_COLUMNS_NO_LOCATION` (types/database.ts) when fetching quests an assignee can see; location is fetched separately only for the creator or after completion
- Photos compressed to max 1200px width, 80% JPEG quality before upload (`lib/photos.ts`)
- Use client-side UUIDs for offline-first record creation
- `Alert.alert` is a no-op on web — use `notify`/`confirm` from `lib/notify.ts`

## Agent Notes

See `AGENTS.md` for full testing/verification instructions. Key things for agents:

- **Source env first**: Every Bash call needs `source scripts/env.sh` — nvm/PATH don't persist between calls
- **Sandbox**: `adb` and `emulator` commands require `dangerouslyDisableSandbox: true` (ADB daemon uses TCP socket on localhost:5037). See AGENTS.md for full sandbox config.
- **Builds are slow**: Always run `eas build` in background (`run_in_background: true`). The APK at `build-output/app.apk` persists — only rebuild after native dependency changes.
- **JS-only changes**: No rebuild needed. Metro hot-reloads. Just edit, save, and screenshot.
- **Interactive prompts**: `eas login`, `eas init`, and `brew install --cask` require user terminal. Don't attempt these from agent shell — ask the user to run them.
- **Screenshots**: Use `adb exec-out screencap -p > file.png` then `Read` the file to see the emulator screen.
