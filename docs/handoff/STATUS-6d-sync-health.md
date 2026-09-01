## Track: 6d-sync-health — Firestore sync, HealthKit write, location queue
Last updated: 2026-09-01 — **track complete for its committed scope; see "What remains unverified"**

### Done
- [x] Ramp-up: ORCHESTRATION.md, wave-06-network.md §4/§5/§7, STATUS-6b/6c, spec §11.3/§13.4/
      §13.5/§9.6/§4.1 remote-config block. HEAD confirmed `27a1b02`, tree clean at start.
- [x] Dependencies: `expo-location` (SDK-57 pin via `npx expo install`),
      `@kingstinct/react-native-healthkit@14.1.0`, `firebase@12.18.0` (both added directly —
      neither is in Expo's managed compatibility table). Commit `eb2dbd8`.
- [x] **§11.4/§4.1 remote-config local mirror** — migration 0006 (`remote_video_config`,
      `sync_cursor`), `repositories/remoteConfig.ts`, `repositories/syncCursor.ts`.
      `WorkoutScreen.tsx`'s `DemoMedia` call site now reads `remoteConfigRepo.getCuratedVideoId`
      instead of the hard-coded `null` 6b left as an explicit seam (closes the `curatedVideoId`
      half of issues #29/#30). Commit `86b5df1`.
- [x] **§11.3 Firestore sync — LWW + push/pull worker** — `sync/lastWriteWins.ts` (pure,
      independently tested), `sync/firestoreSyncClient.ts` (the injected interface `app/`
      implements — `packages/store` never imports the Firebase SDK), `sync/syncRows.ts` (raw
      `updated_at`-carrying projections), `sync/firestoreSyncWorker.ts` (`runFirestoreSync`:
      per-document LWW for `exercise_state`/`rolled_up_stats`, watermark push for `sessions`,
      delta pull for `video/{exercise_id}`, every entity isolated by its own try/catch). Also
      syncs the local `video_flag_count`/`video_demoted_at` counter (closes the "somewhere
      reachable" half of issue #30 — an operator can read it from Firestore once deployed; the
      other half, `video_db.py flagged`, is still 6e's). Commit `6c0ca7d`.
- [x] **§13.4 HealthKit write + §9.6/§11.3 location queue worker** —
      `deviceQueueWorker.ts` drains `healthkit_write`/`passport_geocode` (already enqueued,
      opt-in only, by `completion.ts`) via injected `HealthKitWriter`/`GeocodeCaller`. New
      `repositories/sessions.ts` `applyGeocodeResult` pins the result to the session's own
      `local_date` and writes a `new_city` milestone (the schema/celebration-UI type has existed
      since Wave 5; nothing produced it until now). Commit `a1b01b6`.
- [x] **Firebase project config** — root `firebase.json`, `.firebaserc` (placeholder project id),
      `firestore.rules` (per-uid scoping for `exercise_state`/`rolled_up_stats`/`sessions`,
      read-only `video/{exerciseId}`), `firestore.indexes.json`. Closes issue #35's "no
      firebase.json" half; deploying itself is not done (no credentials here) — operator runbook
      below. Commit `eb5d9d8`.
- [x] **App-side wiring** — `app/src/lib/healthKit.ts`, `geocode.ts`, `firestoreSyncClient.ts`
      (real implementations against the actual installed package types, lazy-loaded like
      `networkStatus.ts`/`workoutAudio.ts`), `opportunisticSync.ts` (wires
      `processDeviceQueue`+`runFirestoreSync` together), called fire-and-forget from
      `HomeScreen.tsx`'s `useFocusEffect`. `app.json` gains the `expo-location` and
      `@kingstinct/react-native-healthkit` config plugins. Commit `9c8ad41`.
- [x] `npm run check` green at every commit boundary listed above (final state: app 83/83,
      engine 897/897, data 14/14, store 93/93, functions 23/23; typecheck all 5 workspaces;
      lint 0 errors 0 warnings; `check:engine-purity` OK).

### In progress
Nothing mid-flight — this is a clean stopping point.

### Next (deliberately not done — see "Deliberate cuts")
- A settings-screen toggle to opt into HealthKit write (`requestHealthKitWritePermission` +
  `updateUser(db, { healthWriteEnabled: true })`) — Passport already has one in `HomeScreen.tsx`
  from Wave 5; HealthKit has no equivalent UI yet. Same shape as carried-forward issue #20.
- A real connectivity-restored/app-foreground trigger for `runOpportunisticSync` beyond "Home
  screen regains focus" — good enough for v1, not the most complete signal.
- `processLlmQueue` app wiring — explicitly issue #34, not this track's scope, not touched.
- RN AsyncStorage persistence for the anonymous Firebase Auth session (see
  `firestoreSyncClient.ts`'s file header) — a real gap for cross-device continuity, zero impact
  on the core loop since nothing here is a read dependency.
- Syncing `progression_state`/`users`/`limitations` — not named explicitly by §11.3's Firestore
  cost note (which calls out the library, `video/{exercise_id}`, rolled-up stats, and
  per-exercise-state documents specifically); cut for scope. Would use the exact same
  `resolveLastWriteWins`/`syncRows.ts` pattern if picked up later.

### Decisions / gotchas
- **Firestore/Auth client-side: `firebase` JS modular SDK, not `@react-native-firebase`.** No
  native linking/config plugin needed — matters because this environment cannot run
  `pod install`/build for real. Cost: no native AsyncStorage auth persistence out of the box
  (documented gap above).
- **§11.3's "delta-sync the library" is the `video/{exercise_id}` remote config, not a separate
  library-delta collection** — confirmed against spec §4.1, which places `video_id`/
  `video_verified_at`/`video_flag_count` explicitly under "Curated video — remote config, never
  bundled" and gives no other remote-config shape for the library. The bundled exercise JSON
  itself (contraindications, patterns, etc.) has no Firestore-delta mechanism in this track —
  matches "the exercise JSON ships in the binary, versioned" (§11.3's own first bullet).
- **Sessions are push-only, no pull-back.** Single local writer in v1 (§11.3: "sessions are
  append-only, so conflicts are rare"); the dashboard never gains a Firestore read dependency
  because of this — `getCompletedSessionsForDashboard` is untouched, still a pure local read.
- **`video_flag_count`/`video_demoted_at` sync closes only half of issue #30.** The local counter
  now has a path to Firestore (`exercise_state` LWW sync); `video_db.py flagged` actually reading
  it from Firestore is track 6e's job, untouched here.
- **HealthKit estimated active energy** (`ESTIMATED_KCAL_PER_MINUTE = 5` in `deviceQueueWorker.ts`)
  is a documented estimate, not a MET-table computation — no heart rate/weight/intensity signal
  exists in v1. Matches §13.4's own wording ("an estimated active-energy value").
- **New city detection** compares the resolved city string against every prior *completed*
  session's `city` column (exact string match, same semantics `buildPassportSummary` in
  `app/src/lib/dashboard.ts` already uses) — not against a separate "visited cities" table.

### What I verified, and how
- **The offline path never blocks.** `firestoreSyncWorker.test.ts`'s "a client that throws for
  every method still returns normally, never throws to the caller" test, and
  `deviceQueueWorker.test.ts`'s "both jobs failing... still returns a normal result object" test.
  Neither mutates any local data on failure — asserted directly (`difficultyEma` unchanged,
  `city`/`country` stay null). `opportunisticSync.ts` additionally wraps both workers in its own
  try/catch so nothing reaches `HomeScreen.tsx`'s render path even if a worker itself somehow
  threw synchronously.
- **Last-write-wins conflict resolution — proven with mutation, per the verification bar.**
  `lastWriteWins.test.ts` covers no-remote/remote-newer/local-newer/exact-tie/sub-second-precision
  directly. `firestoreSyncWorker.test.ts` proves it at the worker level too: a strictly-newer
  fake remote document overwrites the local row; a strictly-older one does not, with the
  assertion checking the actual post-sync row content, not just a call count.
- **The `local_date` pinning of a queued geocode result — proven with mutation, per the
  verification bar.** `deviceQueueWorker.test.ts`'s "a geocode resolved days later still lands
  on the session's own local_date" test resolves the lookup 3 days after completion and asserts
  both the session row and the `new_city` milestone carry the *session's* `local_date`, not the
  resolution instant's. I deliberately broke `applyGeocodeResult` (swapped `session.localDate`
  for `now.slice(0, 10)`) and confirmed the test fails with the expected/received dates exactly
  as predicted, then restored the fix — this is a real red-green cycle, not an after-the-fact
  assertion.
- **HealthKit denial being a silent no-op — proven with mutation, per the verification bar.**
  `deviceQueueWorker.test.ts`'s "denial/unavailability is a SILENT no-op" test asserts the job is
  marked done (not retried, not in `getPendingDeferredWork`) when the injected writer resolves
  having done nothing. I deliberately broke the fake writer to throw instead of resolving on
  denial and confirmed the test fails immediately (`failedOrRetrying` becomes 1), then restored
  it. Separately, `healthKit.test.ts` proves the *real* app-side implementation's own
  unavailability path (native module fails to load under Jest — confirmed by direct probing,
  the `@kingstinct/react-native-healthkit` NitroModules require() throws) resolves without
  throwing, matching the same contract one layer down.
- **A genuine failure (not denial) IS retried** — `deviceQueueWorker.test.ts`'s "a genuine native
  write failure... IS retried" and "a geocode failure (offline) leaves the job pending" tests,
  both checking `attempts`/pending-queue state directly via `queuesRepo`.
- **New-city milestone correctness** — three tests: first-ever city fires exactly one `new_city`
  milestone pinned to the right `local_date`; a second session in the *same* city does not fire a
  second one; a session in a genuinely *different* city fires its own.
- **No key/credential material anywhere** — `firebase.json`/`.firebaserc` contain only a
  placeholder project id string; `firestoreSyncClient.ts` reads every Firebase config value from
  `process.env.EXPO_PUBLIC_FIREBASE_*`, never a literal. Re-grepped the whole repo for
  `apiKey\s*[:=]\s*['"]` and `sk-` style literals — nothing found outside this documented
  env-var-read pattern.
- **App-side lib files typecheck against the real, installed package types** (`tsc --noEmit`
  passes with `@kingstinct/react-native-healthkit`, `expo-location`, and `firebase`'s actual
  `.d.ts` files, not hand-waved shapes) — I read each package's real exported API
  (`WorkoutsModule.nitro.ts`, `Location.d.ts`/`Location.types.d.ts`,
  `firebase/{app,firestore,auth}`'s modular exports) before writing against it, rather than
  guessing method names from memory.

### What remains unverified, and why (stated plainly, per the review bar)
- **No real Firestore instance, no real Auth, no real device HealthKit, no real geocode.** This
  environment has no simulator, no device, and no Firebase project credentials. Every claim above
  is proven at the interface boundary (`FirestoreSyncClient`/`HealthKitWriter`/`GeocodeCaller`)
  with a fake or the real package's own Jest-time degraded behavior — never against the actual
  external system.
- **`firebase.json`/`functions/` have still never been deployed or run against an emulator** —
  same gap `6c` already flagged (issue #35); this track added the config files that make
  deployment *possible* but did not attempt it (no credentials).
- **The Firestore security rules are unverified against the Firestore emulator** — written by
  hand against the documented rules-language semantics, not run through `firebase emulators:start
  --only firestore` with a rules test suite (would need the Firebase CLI + emulator, which needs
  a real `npx firebase-tools` install this environment wasn't asked to add).
- **HealthKit's real authorization-crash footgun.** The package's own README warns that calling
  a HealthKit function for a type whose authorization was never requested can crash the app
  natively. `healthKit.ts` guards this with the `authorizationRequested` in-memory flag, but that
  guard itself is unverified against the real native crash path (can't reproduce without a
  device).
- **No settings-screen HealthKit opt-in toggle exists yet** — the `HealthKitWriter`/permission
  request functions are wired and tested, but nothing in the UI calls
  `requestHealthKitWritePermission()`/`updateUser({ healthWriteEnabled: true })` yet. A user
  cannot actually turn this on from the app today; flagged as a carried-forward issue below.

### Operator runbook — what deploying this actually needs (not run here)
1. `npx firebase-tools login`, then `firebase projects:create` (or use an existing project) and
   put its id in `.firebaserc` (replacing the `REPLACE-WITH-YOUR-FIREBASE-PROJECT-ID`
   placeholder) — **do not commit a real project id if the repo is public; if private, still keep
   any generated service-account JSON out of git** (already covered by no such file existing).
2. Enable Firestore (production mode) and Anonymous Authentication in the Firebase console for
   that project.
3. `firebase deploy --only firestore:rules,firestore:indexes` to publish `firestore.rules`.
4. `firebase functions:secrets:set ANTHROPIC_API_KEY` (from `6c`'s scope, still outstanding), then
   `firebase deploy --only functions` — note `functions/tsconfig.json` currently sets `noEmit:
   true` (inherited from `tsconfig.base.json`) and `module: ESNext`; a real deploy needs a build
   step emitting CommonJS (or an ESM-compatible Cloud Functions runtime config) into a `lib/`
   directory referenced by `functions/package.json`'s `main` — **not set up in this track**, since
   actually deploying was explicitly out of scope. Whoever deploys first will need to add that
   build step.
5. Set the six `EXPO_PUBLIC_FIREBASE_*` env vars (`app.config.js`/EAS secrets) from the Firebase
   console's web app config — these are public client identifiers, not secrets, but still don't
   belong hardcoded in source.
6. `npx expo prebuild --platform ios` (regenerates `ios/` with the new HealthKit/location config
   plugins applied) then `pod install` and a real device/simulator run to actually exercise any
   of this for the first time.

### New dependencies (noted per CLAUDE.md)
- `expo-location` (`app/package.json`, SDK-57 pin via `npx expo install`) — coarse reverse-geocode.
- `@kingstinct/react-native-healthkit@14.1.0` (`app/package.json`) — write-only `HKWorkout`.
  Not in Expo's managed compatibility table; added directly, needs `expo prebuild`.
- `firebase@12.18.0` (`app/package.json`) — Firestore + Auth client SDK, chosen over
  `@react-native-firebase` specifically to avoid a native-linking dependency in an environment
  that can't build for a device.

### Carried-forward issues (for the orchestrator to file)
1. **No real device/simulator/Firestore-emulator verification of any of this track's work**
   (same class as #16/#22/#27) — HealthKit write, reverse-geocode, and Firestore sync are all
   proven only at their injected-interface boundary or against the real package's Jest-time
   degraded behavior. Roll into Wave 7's acceptance pass, with explicit checks for: a real
   `HKWorkout` appears in Health after a completed session with the toggle on; a real
   reverse-geocode resolves and a Passport pin appears; a real Firestore document round-trips
   after `firebase deploy`.
2. **No settings-screen toggle to opt into HealthKit write.** The plumbing (permission request,
   writer, queue drain) is complete and tested; nothing in the UI calls it yet. Small, scoped
   follow-up — same shape as the existing Passport toggle in `HomeScreen.tsx`.
3. **`functions/` still isn't deployable as committed** — needs a CommonJS/ESM build step for
   Cloud Functions' Node runtime (`tsconfig.base.json` is `noEmit: true` project-wide, correct for
   every other workspace but not for a deployed Cloud Function). Carried forward from issue #35;
   this track added the Firebase project config but not that build step, since actually deploying
   was out of scope.
4. **No RN AsyncStorage persistence for the anonymous Firebase Auth session** — a cold app
   restart currently re-authenticates and gets a new uid, orphaning prior synced documents.
   Zero core-loop impact (nothing here is a read dependency) but a real gap before this sync
   layer is relied on for actual cross-device continuity.
5. **Firestore security rules are unverified against the emulator.** Written by hand against the
   documented rules language; never run through `firebase emulators:start --only firestore` with
   a rules test suite.
