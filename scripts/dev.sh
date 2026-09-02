#!/usr/bin/env bash
#
# Start the RoamFit Expo development server.
#
# RoamFit uses a custom dev client (expo-dev-client + config plugins for op-sqlite,
# HealthKit, audio, notifications, location) — it does NOT run in Expo Go. The dev
# client build must be installed on the simulator or device before Metro is useful.
#
#   ./scripts/dev.sh                 start Metro on the LAN (device + simulator)
#   ./scripts/dev.sh --build         build & install the dev client, then start Metro
#   ./scripts/dev.sh --device        build & install on a physical device, then Metro
#   ./scripts/dev.sh --tunnel        start Metro over a tunnel (device on another network)
#   ./scripts/dev.sh --localhost     start Metro bound to localhost (simulator only)
#   ./scripts/dev.sh --clear         clear the Metro bundler cache on start
#   ./scripts/dev.sh --prebuild      regenerate app/ios from app.json first
#
# Flags combine, e.g.  ./scripts/dev.sh --build --clear
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"

HOST_MODE="lan"
DO_BUILD=0
DO_DEVICE=0
DO_PREBUILD=0
CLEAR_CACHE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)     DO_BUILD=1 ;;
    --device)    DO_BUILD=1; DO_DEVICE=1 ;;
    --tunnel)    HOST_MODE="tunnel" ;;
    --localhost) HOST_MODE="localhost" ;;
    --lan)       HOST_MODE="lan" ;;
    --clear|--clean) CLEAR_CACHE=1 ;;
    --prebuild)  DO_PREBUILD=1 ;;
    -h|--help)   sed -n '2,/^[^#]/p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------

[[ "$(uname -s)" == "Darwin" ]] || die "RoamFit is iOS-only; this needs macOS."
command -v node >/dev/null || die "node not found."
[[ -d "$APP_DIR/node_modules" && -d "$REPO_ROOT/node_modules" ]] \
  || { log "Installing workspace dependencies…"; (cd "$REPO_ROOT" && npm install); }

if (( DO_BUILD )); then
  command -v xcodebuild >/dev/null || die "Xcode command line tools not found."
  [[ -d "$APP_DIR/ios/Pods" ]] || log "Pods not installed yet — expo run:ios will run pod install."
fi

# --- optional prebuild -------------------------------------------------------

if (( DO_PREBUILD )); then
  log "Regenerating the iOS project from app.json…"
  (cd "$APP_DIR" && npx expo prebuild --platform ios)
fi

# --- optional native build + install ----------------------------------------

if (( DO_BUILD )); then
  if (( DO_DEVICE )); then
    log "Building the dev client and installing on a connected device…"
    log "(pick your iPhone when prompted; it must be paired and trusted)"
    (cd "$APP_DIR" && npx expo run:ios --device)
  else
    log "Building the dev client and installing on the simulator…"
    (cd "$APP_DIR" && npx expo run:ios)
  fi
  # expo run:ios starts its own Metro server and stays attached; nothing left to do.
  exit 0
fi

# --- start Metro -------------------------------------------------------------

START_ARGS=(--dev-client)
case "$HOST_MODE" in
  tunnel)    START_ARGS+=(--tunnel) ;;
  localhost) START_ARGS+=(--localhost) ;;
  lan)       START_ARGS+=(--lan) ;;
esac
(( CLEAR_CACHE )) && START_ARGS+=(--clear)

if [[ "$HOST_MODE" == "lan" ]]; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [[ -n "$LAN_IP" ]]; then
    log "LAN address: http://$LAN_IP:8081 — device must be on the same Wi-Fi."
  else
    log "No Wi-Fi address found. If your device can't connect, use --tunnel."
  fi
fi

log "Starting Metro (expo start ${START_ARGS[*]})"
log "Open the RoamFit dev client on your device/simulator, or press 'i' here."
log "If the app isn't installed yet, stop and run: ./scripts/dev.sh --build"

cd "$APP_DIR"
exec npx expo start "${START_ARGS[@]}"
