## Track: 42 — Remove Spotify and all of Firebase
Last updated: 2026-10-20

User request: remove all Spotify functionality ("no offline control is a dealbreaker; flaky at best")
and, as the user chose when asked, **all Firebase** too: Firestore sync, Cloud Functions, the LLM
proxy. The app becomes fully local. No traces left.

### Done
- [x] Increment A: Spotify removed (app, store, token-swap function, SDK dep + patch + patch-package, plugin, dev.sh/EAS/DESIGN/BACKLOG); migration 0037 drops spotify_playlists and users.spotify_vibes. `npm run check` green — see git log

### In progress
- Nothing. Both increments landed; final `npm run check` green.

### Next
- Device pass owed: fresh install and an upgrade from an existing install both run migrations
  0037 and 0038 cleanly (DROP COLUMN / DROP TABLE on op-sqlite); Today, Workout and Completion show
  no Spotify row; `npx expo prebuild` no longer references the Spotify plugin.
- `npm install` locally to prune node_modules (firebase, @wwdrew/expo-spotify-sdk, patch-package,
  functions workspace). The lockfile was updated with `--package-lock-only`.

### Decisions / gotchas
- User explicitly chose Spotify + all Firebase (not Spotify-only) when asked.
- Removed with Firebase: `functions/` (LLM proxy, token swap), Firestore sync worker + client, LLM
  queue worker + proxy client, remote-config and sync-cursor repos, engine `llm/validate`,
  `tools/video_db.py` (it only wrote to Firestore), `docs/ACCOUNTS-SCOPING.md` and the functions
  runbook. The coach-voice and distillation enqueues are gone, so `sessions.generated_by` is always
  'engine' (column and the 'engine+llm' type literal left in place, as are the historical
  `llm_distillation_result` signal type and old migrations).
- Cross-device continuity / accounts are gone with this; BACKLOG items for them were deleted.
- Old handoff STATUS files and migration SQL still mention Spotify/Firebase; historical, left.
