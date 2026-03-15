#!/bin/bash
# scripts/setup-dev.sh
# One-time dev environment setup for Quest (trot-n-spot).
# Installs CLI tools, configures Android AVD, and verifies everything works.
#
# Manual steps required before running:
#   1. brew install --cask zulu@17        (requires sudo)
#   2. Install Android Studio             (GUI installer)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "======================================="
echo " Quest (trot-n-spot) Dev Setup"
echo "======================================="
echo ""

# ── Node via nvm ─────────────────────────────────────────────
echo "--- Node.js ---"
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 2>/dev/null || nvm use 20
  ok "Node $(node --version)"
else
  fail "nvm not found. Install from https://github.com/nvm-sh/nvm"
  exit 1
fi

# ── npm dependencies ─────────────────────────────────────────
echo ""
echo "--- npm dependencies ---"
npm install --silent 2>/dev/null
ok "npm install complete"

# ── EAS CLI ──────────────────────────────────────────────────
echo ""
echo "--- EAS CLI ---"
if command -v eas &>/dev/null; then
  ok "eas $(eas --version)"
else
  echo "Installing EAS CLI..."
  npm install -g eas-cli
  ok "eas $(eas --version)"
fi

# ── Supabase CLI ─────────────────────────────────────────────
echo ""
echo "--- Supabase CLI ---"
if command -v supabase &>/dev/null; then
  ok "supabase $(supabase --version 2>&1 | head -1)"
else
  echo "Installing Supabase CLI via Homebrew..."
  if command -v brew &>/dev/null; then
    brew install supabase/tap/supabase
    ok "supabase $(supabase --version 2>&1 | head -1)"
  else
    fail "Homebrew not found. Install from https://brew.sh"
    fail "Then run: brew install supabase/tap/supabase"
  fi
fi

# ── Java ─────────────────────────────────────────────────────
echo ""
echo "--- Java (JDK 17) ---"
if /usr/libexec/java_home -v 17 &>/dev/null; then
  JAVA_HOME=$(/usr/libexec/java_home -v 17)
  export JAVA_HOME
  ok "JDK 17 at $JAVA_HOME"
else
  fail "JDK 17 not found"
  warn "Run: brew install --cask zulu@17  (requires sudo)"
fi

# ── Maestro CLI ──────────────────────────────────────────────
echo ""
echo "--- Maestro CLI ---"
export PATH="$PATH:$HOME/.maestro/bin"
if command -v maestro &>/dev/null; then
  ok "maestro $(maestro --version 2>/dev/null || echo 'installed')"
else
  echo "Installing Maestro..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
  if command -v maestro &>/dev/null; then
    ok "Maestro installed"
  else
    fail "Maestro install failed — check Java is available"
  fi
fi

# ── Android SDK ──────────────────────────────────────────────
echo ""
echo "--- Android SDK ---"
# Try common locations if ANDROID_HOME is not set
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  fi
fi

if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ]; then
  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
  ok "ANDROID_HOME=$ANDROID_HOME"

  # Check for required SDK components
  if command -v sdkmanager &>/dev/null; then
    echo "Checking SDK packages..."
    # Install system image if missing
    if ! sdkmanager --list_installed 2>/dev/null | grep -q "system-images;android-34"; then
      echo "Installing Android 34 system image..."
      yes | sdkmanager "system-images;android-34;google_apis;arm64-v8a" 2>/dev/null || true
    fi
    ok "SDK packages checked"
  fi

  # Create AVD if missing
  if command -v avdmanager &>/dev/null; then
    if ! avdmanager list avd 2>/dev/null | grep -q "quest-test"; then
      echo "Creating quest-test AVD..."
      echo "no" | avdmanager create avd \
        -n quest-test \
        -k "system-images;android-34;google_apis;arm64-v8a" \
        -d pixel_6 \
        2>/dev/null && ok "AVD quest-test created" || warn "AVD creation failed — may need system image installed first"
    else
      ok "AVD quest-test exists"
    fi
  fi

  # Check adb
  if command -v adb &>/dev/null; then
    ok "adb available"
  else
    warn "adb not found in PATH"
  fi

  # Check emulator
  if command -v emulator &>/dev/null; then
    ok "emulator available"
  else
    warn "emulator not found in PATH"
  fi
else
  fail "Android SDK not found"
  warn "Install Android Studio from https://developer.android.com/studio"
  warn "Then add to ~/.zshrc:"
  warn '  export ANDROID_HOME="$HOME/Library/Android/sdk"'
  warn '  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"'
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "======================================="
echo " Setup Summary"
echo "======================================="
echo ""

MISSING=()

command -v node &>/dev/null      && ok "Node $(node --version)"         || { fail "Node"; MISSING+=("node"); }
command -v eas &>/dev/null       && ok "EAS CLI"                        || { fail "EAS CLI"; MISSING+=("eas"); }
command -v supabase &>/dev/null  && ok "Supabase CLI"                   || { fail "Supabase CLI"; MISSING+=("supabase"); }
command -v maestro &>/dev/null   && ok "Maestro"                        || { fail "Maestro"; MISSING+=("maestro"); }
/usr/libexec/java_home -v 17 &>/dev/null && ok "JDK 17"                || { fail "JDK 17"; MISSING+=("java"); }
[ -n "${ANDROID_HOME:-}" ]       && ok "Android SDK"                    || { fail "Android SDK"; MISSING+=("android"); }

echo ""
if [ ${#MISSING[@]} -eq 0 ]; then
  echo -e "${GREEN}All tools installed! Ready to develop.${NC}"
  echo ""
  echo "Next steps:"
  echo "  npx expo start --android    # Start dev server"
  echo "  scripts/test-android.sh     # Full test cycle"
else
  echo -e "${YELLOW}Missing tools: ${MISSING[*]}${NC}"
  echo "Fix the issues above and re-run this script."
fi
