# Agent Testing & Verification

Instructions for a long-running code agent (e.g., Claude Code) to build, install, test, and verify the Quest app — entirely from the CLI. Two testing paths are available:

1. **Android emulator** (CLI-only, no Android Studio) — full native testing
2. **Web preview via Chrome** — fast visual iteration, no emulator needed

---

## Environment Setup

### Quick Start

Run the automated setup script to install all CLI tools and verify the environment:

```bash
scripts/setup-dev.sh
```

This handles everything automatically except one manual step that requires sudo:

```bash
brew install --cask zulu@17   # JDK 17 (requires sudo)
```

No Android Studio needed — the setup script downloads the Android SDK command-line tools directly.

### What the Setup Script Does

`scripts/setup-dev.sh` performs these steps:

1. **JDK 17** — verifies installation (required for Android SDK + Maestro)
2. **Node 20** — switches via nvm (expects `.nvmrc` in project root)
3. **npm dependencies** — runs `npm install`
4. **EAS CLI** — `npm install -g eas-cli`
5. **Supabase CLI** — installs via Homebrew (`brew install supabase/tap/supabase`)
6. **Maestro CLI** — `curl -Ls "https://get.maestro.mobile.dev" | bash`
7. **Android SDK** — downloads command-line tools, installs platform-tools, emulator, Android 34 system image
8. **Android AVD** — creates `quest-test` AVD (Pixel 6, API 34)
9. **Verification** — checks all tools are available and prints a status report

### Environment Variables

Add to `~/.zshrc` (the setup script will remind you if these are missing):

```bash
# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

# Maestro
export PATH="$PATH:$HOME/.maestro/bin"

# Java
export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null)
```

---

## Sandbox & Agent Shell Configuration

### The Shell Problem

Each Bash tool call runs in a fresh shell — nvm, ANDROID_HOME, JAVA_HOME, and PATH are lost between calls. Always prefix commands with:

```bash
source scripts/env.sh && <your command>
```

This sources nvm, sets JAVA_HOME, ANDROID_HOME, and adds all tool paths.

### Sandbox Restrictions

Claude Code's sandbox blocks certain operations. Here's what requires what:

**Works in sandbox** (no special config):
- `npx expo start`, `npx jest`, `npx tsc` — all Node/npm commands
- `git` commands
- File reads/writes within the project directory
- `curl` to allowlisted hosts

**Requires `dangerouslyDisableSandbox: true`**:
- `adb *` — ADB daemon uses a TCP socket on `localhost:5037`
- `emulator *` — emulator uses gRPC + multiple localhost ports
- `maestro *` — connects to ADB and emulator via network
- `eas build --local` — spawns Gradle which needs network + temp file access
- `npx supabase start` — launches Docker containers with network access
- `npx expo start --android` — needs to communicate with ADB to launch the app

**Works in sandbox but needs network allowlist**:
- `npx expo start --web` — serves on `localhost:8081`

**Requires user's terminal** (interactive prompts that agents can't handle):
- `eas login` — password prompt
- `eas init` — confirmation prompt
- `brew install --cask *` — sudo password prompt

### Recommended Workflow for Agents

```bash
# 1. Source env (works in sandbox)
source scripts/env.sh

# 2. Code changes (works in sandbox)
# Edit files, run TypeScript checks, run Jest tests

# 3. Emulator + app interaction (needs dangerouslyDisableSandbox)
source scripts/env.sh && adb devices
source scripts/env.sh && adb exec-out screencap -p > test-results/screen.png
source scripts/env.sh && adb install -r build-output/app.apk

# 4. Start Metro + connect to emulator (needs dangerouslyDisableSandbox)
source scripts/env.sh && npx expo start --android

# 5. Screenshots — take with adb, then Read the file to see it
adb exec-out screencap -p > test-results/screen.png
# Then use the Read tool on test-results/screen.png
```

### Build Caching

Native builds (`eas build --local`) take ~10 minutes. The output APK at `build-output/app.apk` persists across sessions. Only rebuild when:
- A new native dependency is added (e.g., `expo-camera`, `react-native-maps`)
- `app.json` config plugins change
- EAS build profile changes

For JS-only changes, Metro hot-reloads automatically — no rebuild needed. Just edit, save, and re-screenshot.

---

## Testing Path 1: Web Preview (Chrome)

The fastest feedback loop. No emulator, no native build. Expo renders the app in a browser and an agent can interact with it via Chrome DevTools / browser automation.

### Starting the Web Preview

```bash
npx expo start --web
# App available at http://localhost:8081
```

### Agent Verification via Chrome

A code agent with Chrome browser automation tools (e.g., Claude in Chrome MCP) can:

1. Navigate to `http://localhost:8081`
2. Interact with the app (tap buttons, fill forms, navigate tabs)
3. Read page content and verify UI state
4. Take screenshots for visual verification
5. Read console logs for errors

**Limitations of web preview**:
- `expo-camera` and `expo-location` behave differently (browser APIs vs native)
- Push notifications not available
- PowerSync SQLite layer may not work (uses IndexedDB fallback on web)
- Some React Native components may render slightly differently

**Best for**: UI layout, navigation, component rendering, feed/history views, form interactions, styling. Not suitable for camera, location, or offline sync testing.

### Web-Specific Test Commands

```bash
# Start web dev server
npx expo start --web

# Run unit tests (always works, no emulator)
npx jest --ci

# TypeScript check
npx tsc --noEmit
```

---

## Testing Path 2: Android Emulator (CLI-Only)

Full native testing. Required for camera, location, push notifications, and offline sync.

### Emulator Management

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

### Full Agent Workflow

```bash
scripts/test-android.sh              # Full cycle (build + install + test)
scripts/test-android.sh --skip-build # JS-only changes (skip native build)
```

See `scripts/test-android.sh` for the full implementation. Summary:

1. Start local Supabase + reset seed data
2. Ensure Android emulator is running (start headlessly if not)
3. Run unit tests (`npx jest --ci`)
4. Build Android dev client (skip if `--skip-build` or `.apk` exists and no native changes)
5. Install on emulator
6. Start Metro bundler
7. Run Maestro E2E smoke test
8. Capture screenshots + logs to `test-results/`
9. Clean up

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

**Screenshots** (Android emulator):
```bash
# Capture current screen
adb exec-out screencap -p > screen.png

# Maestro captures inline in flows:
# - screenshot: "after-quest-created.png"
```

**Screenshots** (Web preview):
- Use browser automation tools to capture the page

**View hierarchy** (Android — like a DOM):
```bash
adb shell uiautomator dump /sdcard/window_dump.xml
adb pull /sdcard/window_dump.xml
# Parse XML to verify text content, element presence, button states
```

**Logs**:
```bash
# React Native / Expo JS logs (Android)
adb logcat -s ReactNativeJS:V *:S

# Full logcat with timestamps
adb logcat -v time | head -200

# Clear before a test run
adb logcat -c

# Web: use browser console via automation tools
```

---

## Auth in Tests

Google Sign-In doesn't work in automated emulator tests or headless web. Use one of these approaches:

**Recommended (MVP)**: Add a test-only email/password login screen gated behind `__DEV__`:
- Supabase email auth provider enabled for local/dev only
- Maestro fills in `test-sherwin@quest.dev` / test password (Android)
- Browser automation fills in the same credentials (web)
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

## Key Testing Files

| File | Purpose |
|------|---------|
| `scripts/setup-dev.sh` | One-time dev environment setup (CLI tools, Android SDK, AVD) |
| `scripts/test-android.sh` | Full Android test cycle: emulator + build + install + test + report |
| `jest.config.ts` | Jest configuration |
| `tests/setup.ts` | Test setup (mocks for PowerSync, Supabase, Expo modules) |
| `.maestro/config.yaml` | Maestro global config (app ID, timeouts) |
| `.maestro/full-smoke.yaml` | E2E smoke test covering all core flows |
| `supabase/seed.sql` | Deterministic test data |
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
