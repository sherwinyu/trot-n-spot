# Quest (Trot-n-Spot)

Async scavenger hunt app for couples during dog walks. React Native/Expo + Supabase + PowerSync.

## Project Structure

See `MVP_PLAN.md` for full architecture, database schema, and phased build order.

## Tech Stack

- **Client**: React Native + Expo (Expo Router v4, file-based routing)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Offline Sync**: PowerSync
- **Auth**: Supabase Auth + Google OAuth
- **Push**: Expo Notifications
- **E2E Testing**: Maestro
- **Unit Testing**: Jest + React Native Testing Library

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
maestro test .maestro/            # All E2E flows
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
- PowerSync for all reads (reactive local-first queries), Supabase client for uploads
- Location fields are NEVER exposed to quest assignees — enforced at sync rules, DB, and client layers
- Photos compressed to max 1200px width, 80% JPEG quality before upload
- Use client-side UUIDs for offline-first record creation

## Agent Notes

See `AGENTS.md` for full testing/verification instructions. Key things for agents:

- **Source env first**: Every Bash call needs `source scripts/env.sh` — nvm/PATH don't persist between calls
- **Sandbox**: `adb` and `emulator` commands require `dangerouslyDisableSandbox: true` (ADB daemon uses TCP socket on localhost:5037). See AGENTS.md for full sandbox config.
- **Builds are slow**: Always run `eas build` in background (`run_in_background: true`). The APK at `build-output/app.apk` persists — only rebuild after native dependency changes.
- **JS-only changes**: No rebuild needed. Metro hot-reloads. Just edit, save, and screenshot.
- **Interactive prompts**: `eas login`, `eas init`, and `brew install --cask` require user terminal. Don't attempt these from agent shell — ask the user to run them.
- **Screenshots**: Use `adb exec-out screencap -p > file.png` then `Read` the file to see the emulator screen.
