#!/bin/bash
# scripts/test-android.sh
# Full test cycle: Supabase → emulator → unit tests → build → install → E2E → report.
#
# Usage:
#   scripts/test-android.sh              # Full cycle (build + install + test)
#   scripts/test-android.sh --skip-build # JS-only changes (skip native build)

set -euo pipefail

SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

# Load nvm
source "$HOME/.nvm/nvm.sh"
nvm use 2>/dev/null || nvm use 20

# Add tools to PATH
export PATH="$PATH:$HOME/.maestro/bin"
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
fi

# Ensure test-results directory exists
mkdir -p test-results

echo "=== Starting local Supabase ==="
npx supabase start || true
npx supabase db reset

echo ""
echo "=== Checking emulator ==="
if ! adb devices 2>/dev/null | grep -q emulator; then
  echo "Starting emulator..."
  emulator -avd quest-test -no-window -no-audio -gpu swiftshader_indirect &
  adb wait-for-device
  adb shell 'while [[ "$(getprop sys.boot_completed)" != "1" ]]; do sleep 1; done'
  echo "Emulator booted."
else
  echo "Emulator already running."
fi

echo ""
echo "=== Running unit tests ==="
npx jest --ci --coverage || true

if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "=== Building Android dev client ==="
  eas build --profile development --platform android --local --output ./build-output/app.apk

  echo ""
  echo "=== Installing on emulator ==="
  adb install -r ./build-output/app.apk
fi

echo ""
echo "=== Starting Metro ==="
npx expo start --android &
METRO_PID=$!

# Give Metro time to bundle
echo "Waiting for Metro bundler..."
sleep 15

echo ""
echo "=== Running E2E smoke test ==="
adb logcat -c
maestro test .maestro/full-smoke.yaml || true

echo ""
echo "=== Capturing results ==="
adb exec-out screencap -p > test-results/final-state.png 2>/dev/null || true
adb logcat -d -s ReactNativeJS:V > test-results/app-logs.txt 2>/dev/null || true

echo ""
echo "=== Cleaning up ==="
kill $METRO_PID 2>/dev/null || true

echo ""
echo "=== Done ==="
echo "Results in test-results/"
ls -la test-results/
