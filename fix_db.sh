#!/usr/bin/env bash

PLATFORM_DIR="$HOME/quant-platform"
VENV="$PLATFORM_DIR/venv"
BREW_PREFIX=$(brew --prefix)
PLIST_DIR="$HOME/Library/LaunchAgents"
UID_NUM=$(id -u)

mkdir -p "$PLIST_DIR"

for p in api worker beat; do
  DST="$PLIST_DIR/com.quant.${p}.plist"
  
  # Unload first if already loaded
  launchctl bootout "gui/$UID_NUM/com.quant.${p}" 2>/dev/null || true
  
  # Write the plist with all values substituted
  sed \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__VENV__|$VENV|g" \
    -e "s|__PLATFORM__|$PLATFORM_DIR|g" \
    -e "s|__BREW_PREFIX__|$BREW_PREFIX|g" \
    "launchd/com.quant.${p}.plist" > "$DST"
  
  echo "--- com.quant.$p ---"
  cat "$DST"
  echo ""
done