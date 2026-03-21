#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NANOCLAW_DIR="$(dirname "$SCRIPT_DIR")"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

# Detect node path (supports nvm, homebrew, system)
NODE_PATH="$(which node)"
NODE_DIR="$(dirname "$NODE_PATH")"
echo "Using node at: $NODE_PATH"

mkdir -p "$LAUNCH_AGENTS"
mkdir -p "$NANOCLAW_DIR/data/logs"

for plist in "$NANOCLAW_DIR/config/launchd"/com.nanoclaw.mcp-*.plist "$NANOCLAW_DIR/config/launchd"/com.nanoclaw.timetracker.plist; do
  [ -f "$plist" ] || continue
  name=$(basename "$plist")
  # Unload existing if present
  launchctl unload "$LAUNCH_AGENTS/$name" 2>/dev/null || true
  # Replace placeholders with actual paths
  sed -e "s|__NANOCLAW_DIR__|$NANOCLAW_DIR|g" \
      -e "s|__NODE_PATH__|$NODE_PATH|g" \
      -e "s|__NODE_DIR__|$NODE_DIR|g" \
      "$plist" > "$LAUNCH_AGENTS/$name"
  launchctl load "$LAUNCH_AGENTS/$name"
  echo "Installed $name"
done
