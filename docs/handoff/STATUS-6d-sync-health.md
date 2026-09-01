## Track: 6d-sync-health — Firestore sync, HealthKit write, location queue
Last updated: 2026-09-01

### Done
- [x] Ramp-up: ORCHESTRATION.md, wave-06-network.md §4/§5/§7, STATUS-6b/6c, spec §11.3/§13.4/
      §13.5/§9.6/§4.1 remote-config block. HEAD confirmed `27a1b02`, tree clean.
- [x] Read `packages/store`'s existing seams: `repositories/queues.ts` already has
      `healthkit_write`/`passport_geocode` kinds and `completion.ts` already enqueues both
      opt-in (`user.healthWriteEnabled`/`user.passportEnabled`), with `passport_geocode`'s
      payload already carrying `localDate: session.localDate` — the local_date-pinning
      substrate was already built by Wave 5/3. `sessions.city`/`sessions.country` columns
      already exist (nullable). `llmQueueWorker.ts` is the pattern to mirror for the new
      device-queue and sync workers.
- [x] Dependencies added to `app/package.json`: `expo-location` (via `CI=1 npx expo install`,
      SDK-57 pin), `@kingstinct/react-native-healthkit@14.1.0`, `firebase@12.18.0` (plain npm
      install — neither is in Expo's managed compatibility table). `npm run check` green with
      just the dependency bump (no code yet).

### In progress
Implementing in this order (each its own commit):
1. `remote_video_config` + `sync_cursor` tables (migration 0006), `repositories/remoteConfig.ts`,
   `repositories/syncCursor.ts`; wire `curatedVideoId` seam in `WorkoutScreen.tsx`.
2. `sync/lastWriteWins.ts` pure function + tests.
3. `sync/firestoreSyncWorker.ts` — injected `FirestoreSyncClient`, push/pull for exercise_state
   (LWW) + rolled_up_stats (LWW singleton) + sessions (push-only) + video config pull.
4. `deviceQueueWorker.ts` — injected `HealthKitWriter`/`GeocodeCaller`, drains
   `healthkit_write`/`passport_geocode`; new `sessions.ts` setter `applyGeocodeResult`
   (writes city/country onto the session row keyed by the payload's pinned `local_date`/session
   id, never the resolution date) + `new_city` milestone write.
5. `firebase.json` + `firestore.rules` + documented operator deploy steps (no credentials).
6. app-side real implementations behind lazy `require()` (matching `networkStatus.ts`'s
   established pattern): `app/src/lib/healthKit.ts`, `app/src/lib/geocode.ts`,
   `app/src/lib/firestoreSyncClient.ts`; wire opportunistic triggers (foreground/connectivity)
   for the device queue + sync worker only — explicitly NOT wiring `processLlmQueue` (issue #34,
   not this track's scope).

### Next
See "In progress" — proceeding top to bottom.

### Decisions / gotchas
- Firestore/Auth client-side: chose the `firebase` JS modular SDK over `@react-native-firebase`
  because it needs no native linking (works in Expo dev-client without a config plugin), which
  matters given this environment cannot run `pod install`/build for real. Auth is anonymous-only
  in v1 (single local user, no login UI in scope) — documented at the call site.
- HealthKit: no official Expo module exists; `@kingstinct/react-native-healthkit` is the
  community standard with a config plugin. Requires `expo prebuild` + a real device/simulator to
  actually exercise — unverifiable here, same class of gap as 6b's SVG/WebView.
- Firestore sync design deliberately scoped to what the spec names explicitly (§11.3): the
  library (delta, `video/{exercise_id}` only — confirmed against §4.1, there is no separate
  "library delta" collection distinct from the video remote-config), rolled-up stats doc,
  per-exercise state doc. Did NOT sync `progression_state`/`users`/`limitations` — not named by
  §11.3, and each local_date-shaped table already round-trips fine on the single device v1
  targets; cut for scope, flagged below as a carried-forward issue if multi-device becomes real.

### Carried-forward issues (draft — finalized at track completion)
(filled in as work lands)
