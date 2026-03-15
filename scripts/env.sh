#!/bin/bash
# scripts/env.sh
# Source this to set up the full dev environment in any shell.
# Usage: source scripts/env.sh
#
# Designed to be sourced at the top of every agent bash command
# to avoid repeating PATH/env setup boilerplate.

# Node via nvm
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 2>/dev/null || true
fi

# Java
if /usr/libexec/java_home -v 17 &>/dev/null; then
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
fi

# Android SDK
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

# Maestro
export PATH="$PATH:$HOME/.maestro/bin"
