# Agent Testing & Verification

Instructions for a long-running code agent (e.g., Claude Code) to build, install, test, and verify the Quest app on Android — entirely from the CLI.

---

## Environment Prerequisites

One-time setup on the dev machine:

1. **Android SDK** installed via Android Studio or `sdkmanager`
2. **System image**: `sdkmanager "system-images;android-34;google_apis;arm64-v8a"` (use `x86_64` on Intel)
3. **AVD created**:
   ```bash
   avdmanager create avd -n quest-test -k "system-images;android-34;google_apis;arm64-v8a" -d pixel_6
   ```
4. `ANDROID_HOME` / `ANDROID_SDK_ROOT` set in shell profile
5. **Maestro CLI**: `curl -Ls "https://get.maestro.mobile.dev" | bash`
6. **Supabase CLI**: `npm install -g supabase`

---

## Emulator Management

```bash
# Start emulator headlessly (no GUI — works in CI and SSH sessions)
emulator -avd quest-test -no-window -no-audio -gpu swiftshader_indirect &

# Wait for boot
adb wait-for-device
adb shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done'

# Verify it's running
adb devices

# Kill when done
adb emu kill
```

---

## Test Layers

### Layer 1: Unit & Component Tests (no emulator needed)

**Tool**: Jest + React Native Testing Library

```bash
npx jest              # Run all tests
npx jest --ci         # CI mode (no interactivity, fail on no tests)
npx jest --coverage   # With coverage report
```

**What to test**:
- Hooks: `useCreateQuest`, `useCompleteQuest`, `useJourney` — state transitions, data shapes
- Utilities: date formatting, time-to-find duration, location helpers
- Components: `QuestCard`, `HistoryCard` — render with props, conditional rendering
- Location privacy: assert location fields are null/hidden for assignee role

**Test directory**:
```
/tests
  /unit           — Pure logic (date formatting, location helpers, etc.)
  /components     — Component render tests
  /hooks          — Hook tests with mocked providers
```

### Layer 2: E2E Tests with Maestro (requires emulator)

**Tool**: [Maestro](https://maestro.mobile.dev) — YAML-based mobile UI testing, CLI-first.

**Why Maestro**: YAML flows (no compiled test code), built-in screenshot capture, video recording, and assertion primitives. Ideal for a code agent that writes and runs tests iteratively.

```bash
maestro test .maestro/                     # Run all flows
maestro test .maestro/create-quest.yaml    # Run a single flow
maestro record .maestro/full-smoke.yaml --output smoke.mp4  # Record video
```

**Flow directory**:
```
/.maestro
  config.yaml              — Global config (app ID, launch arguments)
  login.yaml               — Auth flow (test account)
  pair.yaml                — Partner pairing
  start-walk.yaml          — Journey start/end
  create-quest.yaml        — Quest creation
  complete-quest.yaml      — Quest completion
  view-history.yaml        — History browsing
  full-smoke.yaml          — All flows end-to-end in sequence
```

**Example flow** (`create-quest.yaml`):
```yaml
appId: com.trotnspot.quest
---
- launchApp
- tapOn: "Start Walk"
- tapOn: "Create"
- assertVisible: "Take Photo"
- tapOn: "Take Photo"
- tapOn: "Use Photo"
- tapOn: "Description"
- inputText: "Blue fire hydrant on Oak St"
- tapOn: "Send Quest"
- assertVisible: "Quest sent!"
- screenshot: "quest-created.png"
```

### Layer 3: Visual Verification & Log Inspection

A code agent can't see the screen, but can capture and inspect what's rendered:

**Screenshots**:
```bash
# Capture current screen
adb exec-out screencap -p > screen.png

# Maestro captures inline in flows:
# - screenshot: "after-quest-created.png"
```

**View hierarchy** (like a DOM for Android):
```bash
adb shell uiautomator dump /sdcard/window_dump.xml
adb pull /sdcard/window_dump.xml
# Parse XML to verify text content, element presence, button states
```

**Logs**:
```bash
# React Native / Expo JS logs only
adb logcat -s ReactNativeJS:V *:S

# Full logcat with timestamps
adb logcat -v time | head -200

# Clear before a test run
adb logcat -c
```

---

## Auth in Tests

Google Sign-In doesn't work in automated emulator tests. Use one of these approaches:

**Recommended (MVP)**: Add a test-only email/password login screen gated behind `__DEV__`:
- Supabase email auth provider enabled for local/dev only
- Maestro fills in `test-sherwin@quest.dev` / test password
- Minimal code, fully automatable

**Alternative**: Pre-seed the secure store with a valid Supabase session token before app launch using `adb shell` commands.

---

## Camera in Emulator

The Android emulator provides a virtual camera scene. Expo Camera will use it. For deterministic tests, push a known image:

```bash
adb push test-assets/quest-photo.jpg /sdcard/Pictures/
```

Then use the image picker fallback (`expo-image-picker`) instead of live camera capture in test flows.

---

## Local Supabase

Always test against a local Supabase instance, not production:

```bash
# Start local stack (PostgreSQL, Auth, Storage, Edge Functions)
npx supabase start

# Reset DB and re-seed
npx supabase db reset

# Local endpoints:
#   API:       http://localhost:54321
#   Dashboard: http://localhost:54323
#   Auth:      http://localhost:54321/auth/v1
#   Storage:   http://localhost:54321/storage/v1
```

**Seed data** (`supabase/seed.sql`) should provide:
- Two users: `test-sherwin@quest.dev` / `test-nadia@quest.dev` (email auth)
- Pre-paired via `partner_id`
- 3 active quests (2 assigned to Sherwin, 1 assigned to Nadia)
- 2 completed quests with photos and timestamps
- Test photos in the storage bucket

`supabase db reset` restores this known state between test runs.

---

## PowerSync in Tests

- Point PowerSync at the local Supabase instance during testing
- For simpler test runs, bypass PowerSync and use direct Supabase queries (still validates UI and business logic)
- To test offline sync: toggle connectivity on the emulator:
  ```bash
  adb shell svc wifi disable   # Go offline
  # ... create quest, verify it's saved locally ...
  adb shell svc wifi enable    # Come back online
  # ... verify sync completes ...
  ```

---

## Full Agent Workflow

The complete build → install → test → verify cycle:

```bash
#!/bin/bash
# scripts/test-android.sh

set -e

echo "=== Starting local Supabase ==="
npx supabase start
npx supabase db reset

echo "=== Checking emulator ==="
if ! adb devices | grep -q emulator; then
  emulator -avd quest-test -no-window -no-audio -gpu swiftshader_indirect &
  adb wait-for-device
  adb shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done'
fi

echo "=== Running unit tests ==="
npx jest --ci --coverage

echo "=== Building Android dev client ==="
# Skip if .apk already exists and no native changes
eas build --profile development --platform android --local

echo "=== Installing on emulator ==="
adb install -r ./build-output/app.apk

echo "=== Starting Metro ==="
npx expo start --android &
METRO_PID=$!
sleep 10  # Wait for bundler

echo "=== Running E2E smoke test ==="
adb logcat -c  # Clear logs
maestro test .maestro/full-smoke.yaml

echo "=== Capturing results ==="
adb exec-out screencap -p > test-results/final-state.png
adb logcat -d -s ReactNativeJS:V > test-results/app-logs.txt

echo "=== Cleaning up ==="
kill $METRO_PID

echo "=== Done ==="
```

**For JS-only changes** (no new native modules): skip the build step. Metro hot-reloads automatically. Just save the file and re-run Maestro flows.

**For native changes** (new Expo module, config plugin): must rebuild with `eas build ... --local`.

---

## Key Testing Files

| File | Purpose |
|------|---------|
| `jest.config.ts` | Jest configuration |
| `tests/setup.ts` | Test setup (mocks for PowerSync, Supabase, Expo modules) |
| `.maestro/config.yaml` | Maestro global config (app ID, timeouts) |
| `.maestro/full-smoke.yaml` | E2E smoke test covering all core flows |
| `supabase/seed.sql` | Deterministic test data |
| `scripts/test-android.sh` | One-shot: emulator + build + install + test + report |
| `test-assets/` | Static images for deterministic camera/photo tests |

---

## CI (Future)

Not needed for MVP, but this setup maps directly to GitHub Actions:

```yaml
jobs:
  test:
    runs-on: macos-latest  # Hardware-accelerated Android emulator
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx jest --ci
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          script: |
            npx supabase start
            npx supabase db reset
            adb install -r app.apk
            maestro test .maestro/full-smoke.yaml
```
