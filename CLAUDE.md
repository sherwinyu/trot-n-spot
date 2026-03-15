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

```bash
# Dev
npx expo start                    # Start Metro bundler
npx expo start --android          # Start and open on Android

# Build
eas build --profile development --platform android --local   # Local Android dev build
eas build --profile development --platform ios --local       # Local iOS dev build

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
```

## Conventions

- All routes live in `/app` (Expo Router file-based routing)
- Business logic in `/hooks` and `/lib`, not in components
- PowerSync for all reads (reactive local-first queries), Supabase client for uploads
- Location fields are NEVER exposed to quest assignees — enforced at sync rules, DB, and client layers
- Photos compressed to max 1200px width, 80% JPEG quality before upload
- Use client-side UUIDs for offline-first record creation

## Agent Testing

See `AGENTS.md` for full instructions on automated testing and verification in Android environments.
