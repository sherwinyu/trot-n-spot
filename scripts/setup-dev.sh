#!/bin/bash
# scripts/setup-dev.sh
# One-time dev environment setup for Quest (trot-n-spot).
# Installs CLI tools, Android SDK (CLI-only, no Android Studio needed),
# configures Android AVD, and verifies everything works.
#
# Manual step required before running:
#   brew install --cask zulu@17   (requires sudo)

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

# ── Java ─────────────────────────────────────────────────────
echo "--- Java (JDK 17) ---"
if /usr/libexec/java_home -v 17 &>/dev/null; then
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
  ok "JDK 17 at $JAVA_HOME"
else
  fail "JDK 17 not found"
  warn "Run: brew install --cask zulu@17  (requires sudo)"
  exit 1
fi

# ── Node via nvm ─────────────────────────────────────────────
echo ""
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

# ── Android SDK (CLI-only) ───────────────────────────────────
echo ""
echo "--- Android SDK ---"

# Default SDK location (matches Android Studio convention)
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

if [ ! -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android command-line tools..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"

  CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  curl -L -o /tmp/cmdline-tools.zip "$CMDLINE_TOOLS_URL" 2>/dev/null
  unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools-temp
  mv /tmp/cmdline-tools-temp/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
  rm /tmp/cmdline-tools.zip
  find /tmp/cmdline-tools-temp -delete 2>/dev/null || true
  ok "Command-line tools installed"
else
  ok "Command-line tools already present"
fi

export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"

# Accept licenses
echo "Accepting SDK licenses..."
printf 'y\ny\ny\ny\ny\ny\ny\ny\n' | sdkmanager --licenses &>/dev/null
ok "Licenses accepted"

# Install SDK packages
REQUIRED_PACKAGES=(
  "platform-tools"
  "emulator"
  "platforms;android-34"
  "system-images;android-34;google_apis;arm64-v8a"
)

for pkg in "${REQUIRED_PACKAGES[@]}"; do
  if sdkmanager --list_installed 2>/dev/null | grep -q "$pkg"; then
    ok "$pkg already installed"
  else
    echo "Installing $pkg..."
    sdkmanager "$pkg" 2>/dev/null
    ok "$pkg installed"
  fi
done

# ── Android AVD ──────────────────────────────────────────────
echo ""
echo "--- Android AVD ---"
if avdmanager list avd 2>/dev/null | grep -q "quest-test"; then
  ok "AVD quest-test exists"
else
  echo "Creating quest-test AVD..."
  echo "no" | avdmanager create avd \
    -n quest-test \
    -k "system-images;android-34;google_apis;arm64-v8a" \
    -d pixel_6 \
    2>/dev/null && ok "AVD quest-test created" || warn "AVD creation failed"
fi

# ── Shell environment check ──────────────────────────────────
echo ""
echo "--- Shell Environment ---"
ZSHRC="$HOME/.zshrc"
MISSING_EXPORTS=()

if ! grep -q 'ANDROID_HOME' "$ZSHRC" 2>/dev/null; then
  MISSING_EXPORTS+=('export ANDROID_HOME="$HOME/Library/Android/sdk"')
  MISSING_EXPORTS+=('export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"')
fi
if ! grep -q '.maestro/bin' "$ZSHRC" 2>/dev/null; then
  MISSING_EXPORTS+=('export PATH="$PATH:$HOME/.maestro/bin"')
fi
if ! grep -q 'JAVA_HOME' "$ZSHRC" 2>/dev/null; then
  MISSING_EXPORTS+=('export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null)')
fi

if [ ${#MISSING_EXPORTS[@]} -gt 0 ]; then
  warn "Add these to your ~/.zshrc:"
  for line in "${MISSING_EXPORTS[@]}"; do
    echo "  $line"
  done
else
  ok "Shell environment configured"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "======================================="
echo " Setup Summary"
echo "======================================="
echo ""

MISSING=()

command -v node &>/dev/null             && ok "Node $(node --version)"       || { fail "Node"; MISSING+=("node"); }
command -v eas &>/dev/null              && ok "EAS CLI"                      || { fail "EAS CLI"; MISSING+=("eas"); }
command -v supabase &>/dev/null         && ok "Supabase CLI"                 || { fail "Supabase CLI"; MISSING+=("supabase"); }
command -v maestro &>/dev/null          && ok "Maestro"                      || { fail "Maestro"; MISSING+=("maestro"); }
/usr/libexec/java_home -v 17 &>/dev/null && ok "JDK 17"                     || { fail "JDK 17"; MISSING+=("java"); }
command -v emulator &>/dev/null         && ok "Android Emulator"             || { fail "Android Emulator"; MISSING+=("emulator"); }
command -v adb &>/dev/null              && ok "ADB"                          || { fail "ADB"; MISSING+=("adb"); }
avdmanager list avd 2>/dev/null | grep -q "quest-test" && ok "AVD quest-test" || { fail "AVD quest-test"; MISSING+=("avd"); }

echo ""
if [ ${#MISSING[@]} -eq 0 ]; then
  echo -e "${GREEN}All tools installed! Ready to develop.${NC}"
  echo ""
  echo "Next steps:"
  echo "  npx expo start --android    # Start dev server + emulator"
  echo "  npx expo start --web        # Start dev server + web preview"
  echo "  scripts/test-android.sh     # Full Android test cycle"
else
  echo -e "${YELLOW}Missing tools: ${MISSING[*]}${NC}"
  echo "Fix the issues above and re-run this script."
fi
