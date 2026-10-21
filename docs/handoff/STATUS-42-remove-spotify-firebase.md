## Track: 42 — Remove Spotify and all of Firebase
Last updated: 2026-10-20

User request: remove all Spotify functionality ("no offline control is a dealbreaker; flaky at best")
and, as the user chose when asked, **all Firebase** too: Firestore sync, Cloud Functions, the LLM
proxy. The app becomes fully local. No traces left.

### Done
- [x] Increment A: Spotify removed (app, store, token-swap function, SDK dep + patch + patch-package, plugin, dev.sh/EAS/DESIGN/BACKLOG); migration 0037 drops spotify_playlists and users.spotify_vibes. `npm run check` green — see git log

### In progress
- Increment B: Firebase removal (starting).

### Next
- Increment B: Firebase. Delete `functions/` workspace, firebase.json, firestore.*, app
  `firestoreSyncClient`/`llmProxyClient`/`opportunisticSync` (keep device queue drain: HealthKit +
  geocode), store `sync/`, `llmQueueWorker`, `remoteConfig`/`syncCursor` repos; `firebase` dep.
  Migration 0038 drops `remote_video_config`, `sync_cursor`, pending `llm_*` deferred_work rows.
- Increment C: docs. CLAUDE.md (Stack, invariants 1/8 wording), BACKLOG items, README, RUNBOOK,
  ACCOUNTS-SCOPING, SPOTIFY-SETUP, tools/video_db.py (writes to Firestore).
- Final: `npm run check`, `npm install` to refresh the lockfile.

### Decisions / gotchas
- User explicitly chose Spotify + all Firebase (not Spotify-only). Motivation copy loses its LLM
  source; whatever local pool exists stays.
- Old handoff STATUS files mention Spotify/Firebase; they are historical and left as-is.
