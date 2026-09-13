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
#
# Spotify (SPOTIFY_CLIENT_ID, EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL,
# EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL — see docs/SPOTIFY-SETUP.md) is picked up from the
# environment or from a gitignored .env.local at the repo root, so a --build/--prebuild bakes
# them into every dev-client build instead of only the one where you happened to `export` them
# by hand.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"

# --- load local env (Spotify config lives here, never in a tracked file) ----

if [[ -f "$REPO_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.local"
  set +a
fi

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

# --- Spotify config check -----------------------------------------------------
#
# SPOTIFY_CLIENT_ID is read by app/app.config.js at prebuild time (native config plugin, ends up
# in Info.plist); the two EXPO_PUBLIC_ vars are inlined into the JS bundle by Metro at build time.
# Both only take effect on a --prebuild/--build, which is why this lives here and not at the top
# of the script. Unset is a supported, quiet no-op (app.config.js falls back to plain app.json and
# the workout screen renders no Spotify UI at all) — so this warns rather than `die`s. A build
# with SOME but not all three set is the broken state that produces "Spotify sign-in isn't
# finished setting up on this build" on device, so that combination gets called out specifically.
if (( DO_BUILD || DO_PREBUILD )); then
  spotify_vars_set=0
  [[ -n "${SPOTIFY_CLIENT_ID:-}" ]] && (( spotify_vars_set++ )) || true
  [[ -n "${EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL:-}" ]] && (( spotify_vars_set++ )) || true
  [[ -n "${EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL:-}" ]] && (( spotify_vars_set++ )) || true

  if (( spotify_vars_set == 3 )); then
    log "Spotify config present — this build will include the token-swap URLs."
  elif (( spotify_vars_set == 0 )); then
    log "No Spotify config found — building without Spotify (see docs/SPOTIFY-SETUP.md)."
  else
    die "Spotify env is partially set (SPOTIFY_CLIENT_ID, EXPO_PUBLIC_SPOTIFY_TOKEN_SWAP_URL, EXPO_PUBLIC_SPOTIFY_TOKEN_REFRESH_URL must be set together or not at all — see docs/SPOTIFY-SETUP.md). A build like this connects to Spotify but fails auth with 'no token swap server'."
  fi
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
