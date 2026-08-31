## Track: 4-loop — Core workout loop (UI)
Last updated: 2026-08-31 (session resumed once after a network drop; orchestrator confirmed
`64acf3b` was committed clean on my behalf during the gap — see git log, nothing was lost)

### Latest increment (6cae516) — orchestrator-flagged concurrency hang + two real bugs found writing tests
The orchestrator ran `npm run check` while I was also running tests and hit a hang past 10
minutes (had to kill it), traced to two concurrent Jest processes racing on one fixed
`roamfit.sqlite` file that `app/src/db/index.ts`'s `getDb()` always opened — `maxWorkers: 1`
(added in `26a52ae`) only serialized files *within* one process, not two separate processes.
Fixed properly: `getDb()` now derives a unique db filename per Jest process/worker/file (detected
via `process.env.JEST_WORKER_ID`, unset — and so inert — outside Jest), `maxWorkers` reverted to
default, a `PRAGMA busy_timeout = 5000` added as defense in depth (a locked db now fails fast
with a clear error instead of hanging), and a `jest.globalTeardown.js` sweeps up test db files
older than 10 minutes (age-gated so it can't delete a file a genuinely concurrent sibling run
still has open). **Verified**: 22/22 passes across sequential and 2-3-way concurrent
`npm run test --workspace app` runs (this reliably reproduced the reported hang before the fix,
and no longer does after). **Full `npm run check` wall-clock time: ~12s** (all workspaces —
engine 856 tests, store 32, data 2, app 11). The app suite itself (~1.2s) is not the slow part;
nothing here is materially slower than engine+store.

Writing `WorkoutScreen.rest.test.tsx` (driving the rest timer's `+15s`/`-15s`/Skip and the §8.1
feedback controls through the real `WorkoutScreen`, not mocked) surfaced two more real bugs,
fixed in the same commit:
- **Feedback was recorded against the wrong exercise.** `finishSetAndRest` calls `reload()` right
  after logging a set, which recomputes `current`/`entry` to the *next* entry (correct for the
  rest screen's "next up" preview) — but the difficulty/enjoyment handlers read `entry.id` from
  that same post-reload value, so a rating tapped on the rest screen landed on the *upcoming*
  exercise, not the one just performed. Fixed with a `restingEntryId` state captured before
  reload.
- **`recordEntryFeedback` couldn't represent "clear."** Its `{difficulty?, enjoyment?}` params
  used `undefined` for both "field omitted" and what the UI meant by "user tapped the same value
  again to clear it" — so clearing silently did nothing. Widened to accept `| null` as a genuine
  third state (clear, no EMA update), distinct from omitted. New store test in `signals.test.ts`
  covers all three states.
- Also found (both files): `@testing-library/react-native`'s `fireEvent.press` is `async`, same
  class of miss as `render()` (carried-forward issue #6) — unawaited presses could leave a state
  update in flight when the next assertion ran. All `fireEvent.press` calls now awaited.

**Takeaway for future waves, worth restating**: `npm run check` passing is necessary but not
sufficient. This track has now found five distinct real bugs — none caught by `npm run check`
alone — purely by (a) actually running the app on a simulator (the `node:fs`/`expo-linking` red
screens) and (b) writing interaction tests against the *real* driver instead of a mock (the
migration multi-statement/comment bugs, the feedback-attribution bug, the clear-semantics bug,
the concurrency hang). Green types and green unit tests are not evidence the loop works.

### Done
- [x] Read ramp-up docs: wave-04 brief, ORCHESTRATION carried-forward items 6/8/10/13,
  STATUS-3-persistence "Next" section, ADR 0002 (15-min floor), ADR 0003 (store package split),
  `packages/engine/src/index.ts`, `packages/store/src/index.ts`,
  `packages/store/src/simulation.test.ts` (the generate -> createPendingSession -> startSession ->
  logSet -> completeSession flow this wave follows, not reinvents), spec §10.1-§10.10/§8.1/§8.2/
  §5.3/§1.1.
- [x] **Carried-forward issue #10** (`efe1e6a`) — `createFileTestDb()`/`FileTestDb.reopen()` in
  `packages/store/src/testHarness.ts`; `lifecycle.test.ts`'s crash-safety test now really closes
  a connection and cold-reopens the same on-disk file instead of reusing one `:memory:` handle.
- [x] **Carried-forward issue #6** — retried `@testing-library/react-native` (`23d5aaa`). It
  works fine at v14.0.1 under this Expo 57 / RN 0.86 / React 19 stack. Wave 1's "empty object"
  bug was that RNTL v14's `render()` is `async` and wasn't being awaited — not a stack
  incompatibility. Confirmed with a throwaway probe, then used for real in `HomeScreen.test.tsx`.
- [x] **`app/src/db/` wiring per ADR 0003** (`23d5aaa`) — `app/src/db/index.ts` opens the
  on-device db via op-sqlite, runs `@roamfit/store`'s migration runner, returns a `Db` handle.
  Discovered along the way that ADR 0003's premise ("both drivers are sync, swapping is a
  constructor call") doesn't hold at the pinned `drizzle-orm@0.45.2` — `drizzle-orm/op-sqlite` is
  async-only. Recorded as **ADR 0004** and closed with `app/src/db/opSqliteSyncDriver.ts`, a
  ~250-line synchronous Drizzle driver over op-sqlite's `executeSync`/`executeRawSync`, modeled
  directly on `drizzle-orm/better-sqlite3`'s own driver/session classes. `packages/store` itself
  needed **zero changes** for this one.
- [x] A real op-sqlite execution-API bug found by exercising the driver against a live db (not
  just typechecking), fixed in `app/src/db/index.ts` (`d852a7a`): `executeSync` only accepts one
  SQL statement per call (unlike `better-sqlite3`'s multi-statement `.exec()`), and it rejects a
  leading `-- comment` line even ahead of one otherwise-valid statement. Migration exec now splits
  into individual statements with full-line comments stripped first.
- [x] **Wall-clock timer controllers** (`ef03890`) — `app/src/lib/wallClockTimer.ts`:
  `createCountdownController` (rest timer, timed-exercise countdown) and
  `createStopwatchController` (timed-exercise "actual seconds held", elapsed workout time). Pure,
  no React, no ambient timers — every read re-derives from an absolute target instant and the
  injected clock, so there's no per-tick counter to lose ticks across a suspension. Tests in
  `wallClockTimer.test.ts` **jump the fake clock forward by a large amount between two calls with
  no tick in between** (simulating the JS thread being suspended while backgrounded/locked) and
  assert the displayed value is still correct — this is the specific verification bar the brief
  calls out, not a "advance a fake tick" test. 7 tests, all passing. **This is unit-level proof
  only** — it has not been re-verified against a real backgrounded/locked device (see Next).
- [x] **Navigation + all five screens** (`d852a7a`): `app/src/navigation/RootNavigator.tsx`
  (`@react-navigation/native` + `native-stack` — boring, standard for Expo, no separate state
  library needed since all state lives in the store and screens read it directly) and
  Home/Generate/Approval/Workout/Summary. Every mutation goes through a `@roamfit/store`
  repository function; grep the screens for `sessionsRepo.`/`usersRepo.`/`exerciseStateRepo.` —
  there is no SQL and no prescription/selection/progression logic in `app/`.
- [x] `useKeepAwake()` wired into `WorkoutScreen` (`dd2cff8`) — §10.8's keep-awake-for-the-whole-
  session, released automatically on unmount (covers both completion and abandonment).
- [x] `HomeScreen.test.tsx` — a real RNTL interaction test against the **actual** op-sqlite-backed
  store (nothing mocked): renders the full navigator, taps Quick Session, and asserts the app
  really lands on a freshly created + started Workout screen.
- [x] **A real `expo run:ios` simulator build and run** — this is where the two bugs below were
  actually caught; recorded honestly rather than fixed quietly (screenshots in
  `docs/handoff/evidence/`, see Evidence section):
  1. First build red-screened with `Error: Cannot find native module 'ExpoLinking'`
     (`01-red-screen-missing-expo-linking.png`) — `@react-navigation/native` pulls in a `Linking`
     dependency that needs the real `expo-linking` native module, which wasn't an explicit
     dependency. Fixed by adding `expo-linking` to `app/package.json` and re-running `pod install`.
  2. Second build got past that and installed, but red-screened the instant `HomeScreen` called
     `getDb()`: `Unable to resolve module node:fs from .../packages/store/src/migrate.ts`
     (`02-red-screen-metro-cannot-resolve-node-fs.png`). `migrate.ts` read migration `.sql` files
     off disk at runtime (`fs.readdirSync`/`readFileSync`) — fine under Jest/node, but Metro (the
     real app's bundler) has no `node:fs` and no on-device source directory to read from. **This
     is exactly the class of bug only a real simulator run catches** — `tsc` and Jest both accept
     `node:fs` because they both really have it.
  Fixed (`64acf3b`, `packages/store` change, small and scoped like issue #10's) by embedding the
  migration SQL as plain TS string constants (`packages/store/src/migrations/data.ts`) and
  rewriting `migrate.ts` to have **zero** Node-builtin dependency. The original `.sql` files are
  kept as reviewable source; `migrate.test.ts` asserts byte-for-byte sync between them and the
  embedded copy so the duplication can't silently drift. Recorded as **ADR 0005**.
  3. After both fixes, reloaded the already-running app in the simulator (no full rebuild needed
     — this was a JS-only fix) and the **Home screen renders correctly for real**
     (`03-home-screen-working-after-fix.png`): the Today card, the explanation text, and the
     Quick Session button all render exactly as designed, driven by the real op-sqlite-backed
     store on-device.
  4. **Could not go further physically on the simulator**: this sandboxed environment has no
     accessibility/UI-automation permission for `System Events` (`osascript` click attempts
     returned error -25204, "not allowed"), and no `idb`/similar tap-injection tool is installed.
     I could not tap "Quick Session" on the physical simulator screen to screenshot the rest of
     the loop. The rest of the loop (Quick Session -> Workout -> logging sets -> Summary ->
     FINISH) is proven by `HomeScreen.test.tsx` and `packages/store`'s own `simulation.test.ts`
     against the identical calls the screens make, but **not by a simulator screenshot** — flagged
     honestly rather than implied. A future agent with UI-automation access (or a human) should
     finish this: tap through Quick Session -> a couple of sets -> Summary -> FINISH and capture
     screenshots at each stage.
- [x] `npm run check` (typecheck + lint + test + engine-purity, all workspaces) green at every
  commit boundary. Current counts (post `6cae516`): engine 856, store 32, data 2, app 11 (5
  suites: `App.test.tsx`, `wallClockTimer.test.ts`, `HomeScreen.test.tsx`,
  `WorkoutScreen.resume.test.tsx`, `WorkoutScreen.rest.test.tsx`). Full `npm run check` wall-clock:
  ~12s. Verified stable under concurrent execution (22/22 passes, see "Latest increment" above).

### In progress / stopped here
Nothing mid-edit — every commit above is a clean, working checkpoint.

### Next
1. **Finish the simulator walkthrough** with real taps (needs either accessibility permission
   granted to whatever drives `osascript`/System Events in this environment, or an `idb`-style
   tap-injection tool installed) — Home -> Quick Session -> log a couple of sets -> rest timer ->
   Summary -> FINISH, screenshotting each stage into `docs/handoff/evidence/`. This is the
   single most valuable remaining piece of evidence; everything else about the loop is proven at
   the test level but not visually, on-device, end to end.
2. **A real backgrounding/locking test on-device** — `wallClockTimer.test.ts` proves the
   controller's math is suspension-proof with an injected fake clock, but the coordinator
   explicitly wants this re-verified against real backgrounding (send the simulator to background
   with a rest timer running, wait, foreground it, confirm the displayed value is correct — a
   fake-tick test alone does not satisfy this). Not done from this session.
3. **App-level force-quit/resume test**: `WorkoutScreen.tsx`'s `findCurrent()` resume logic
   mirrors `packages/store`'s own proven crash-safety rule exactly ("first entry whose
   `setLogs.length < sets`", no separate cursor), but there is no test that actually unmounts/
   remounts (or kills and relaunches) the screen mid-session and asserts it resumes at the right
   set. Store-level proof exists (`lifecycle.test.ts`); app-level proof doesn't yet.
4. **Mid-workout swap (§10.6)** — not implemented. It needs an engine-exposed "3-5 alternatives
   for this pattern slot, same progression level, all filters respected" query.
   `packages/engine/src/index.ts` doesn't export one (only `generateSession`/
   `generateQuickSession`, which pick a whole plan, not "give me alternatives for this one
   slot"). Implementing candidate selection in `app/` to fake this would put an exercise-
   selection decision in the UI layer, which directly violates this wave's core rule — so it was
   left undone rather than faked. **This needs a small, scoped `packages/engine` addition**
   (something like `alternativesForSlot(library, families, userState, { pattern, anchorClass,
   progressionLevelId, excludeExerciseId }): Exercise[]`, reusing existing filter/candidate
   machinery in `packages/engine/src/filters/`/`selection/`). **Note for whoever picks this up:**
   as of this session, track `2b-timefit-slots` is actively working inside `packages/engine/`
   (time-fit slot bug) — coordinate before touching that package, don't just dive in. Once the
   export exists, wire `sessionsRepo.recordSwap` (already implemented and tested in
   `packages/store`) to a real swap-picker UI in `WorkoutScreen.tsx`.
5. **Approval-time gaps**: `packages/store`'s sessions repository has `removeEntryAtApproval` and
   `adjustSetsAtApproval` but no `addEntryAtApproval` or `adjustRepTargetAtApproval` — "Add
   exercise" and "edit rep target" at approval (§10.3) aren't implemented for the same reason:
   no store mutation to call, and inventing one in `app/` would be new persistence logic, which
   CLAUDE.md forbids. Small, scoped `packages/store` additions, then straightforward UI wiring.
6. **"Regenerate with a note" / "Describe it instead"** (§10.2/§10.3) — routes through the online
   §7.1 LLM-intake path, out of scope for this wave's offline-first loop. Not started.
7. **Audio ducking, haptics, background rest-timer notification** (§10.8/§10.7) — not implemented
   at all. Real remaining scope: `expo-av`/`expo-audio` for a ducked background audio session +
   3-2-1/completion cue tones respecting the silent switch with an override, `expo-haptics` for
   start/halfway/completion pulses carrying the same info when muted, and `expo-notifications`
   for a local notification at rest-timer-zero so the rest timer really "works with the screen
   locked or the app backgrounded" (currently it only fires while foregrounded — the countdown
   math is wall-clock-correct on resume, but nothing alerts the user while backgrounded).
8. **Rep-target editing at approval, superset "Round N of M" display, native share sheet on the
   level-up/milestone screen (§9.10)** — all noted inline in the relevant screen's file comment,
   none implemented.
9. ~~Component tests for the rest timer's `+15s`/`-15s`/Skip and the feedback controls' unset
   semantics~~ — done in `WorkoutScreen.rest.test.tsx` (`6cae516`), and found two real bugs in the
   process (see "Latest increment" at the top of this file). Still not covered: **Approval's**
   remove/adjust-sets interactions (only exercised indirectly, never via a dedicated RNTL test),
   and `WorkoutScreen`'s `TimedExercise` path (flagged as fragile below) has no interaction test
   at all yet — the two existing `WorkoutScreen.*.test.tsx` files both deliberately fast-forward
   past timed entries to reach a reps entry, so the get-ready/countdown/end-early flow is only
   type-checked, never exercised by a test.

### Decisions / gotchas
- **Navigation**: `@react-navigation/native` + `@react-navigation/native-stack` — boring, widely
  supported, the standard pairing for Expo. **No separate client-state library** (no Redux/
  Zustand/Jotai): every screen reads directly from `@roamfit/store` via `useStore()`
  (`app/src/state/StoreContext.tsx`) and re-fetches with `useFocusEffect`/local `useState` after
  each mutation. There is no cross-cutting UI state that isn't already owned by the store, so a
  second state system would just be a duplicate source of truth.
- **`WorkoutScreen` is one screen, not three routes** (Active-reps / Active-timed / Rest as
  separate navigator screens would remount on every phase transition). Phase
  (`'exercise' | 'resting'`) is local component state; each phase's sub-view is given a `key`
  (`${entry.id}-${setIndex}`) so React remounts it on the next set, which gives each set/rest a
  **fresh** `useCountdown` controller rather than trying to reset a shared one.
- **Crash-safety resume is intentionally "dumb"**: `findCurrent()` in `WorkoutScreen.tsx` just
  scans `session.entries` in plan order and returns the first entry whose `setLogs.length < sets`
  — no separate "cursor" stored anywhere in `app/`. Mirrors `packages/store`'s own
  `lifecycle.test.ts` crash-safety rule exactly. Not yet proven with an app-level test (see Next #3).
- **op-sqlite's Node build is real enough to run tests against.** `app/src/db/index.ts`'s
  `getDb()` runs unmodified inside Jest (jest-expo's `jest-environment-jsdom` + this project's
  `transformIgnorePatterns` fix, see `app/jest.config.js`) and actually opens/migrates a real
  sqlite file on disk (`roamfit.sqlite`, gitignored — see `.gitignore`). This is why
  `HomeScreen.test.tsx` is real evidence and not a mock-heavy illusion: the exact same `getDb()`
  the simulator calls is what the test calls. It's also why the `node:fs` bug above did **not**
  show up in `npm run check` at all — Jest and Metro resolve modules completely differently, and
  only a real `expo run:ios` catches a Metro-only resolution failure. **Lesson for future waves:
  `npm run check` passing is necessary but not sufficient evidence the app works on-device.**
- `app/src/lib/useCountdown.ts`'s `TimedExercise` sub-component (in `WorkoutScreen.tsx`) chains
  two `useCountdown` instances (a 3s get-ready, then the main duration) with a couple of
  `useEffect`s reacting to each other's ticks. It works (typechecks, exercised indirectly by
  `HomeScreen.test.tsx` whenever Quick Session happens to pick a timed exercise) but is more
  fragile than the reps path — a future pass should consider collapsing it into one controller
  with an internal "get ready then run" state rather than two coordinated ones.
- **Do not add a second sync SQLite driver or hand-roll SQL in `app/`.** Everything from
  `sessionsRepo`/`usersRepo`/`exerciseStateRepo`/`progressionStateRepo`/`statsRepo` +
  top-level `generate`/`completeSession` already covers what this wave's screens need except the
  gaps in Next #4/#5 — check there again before writing a new store call.
- **`packages/engine/` is currently owned by a concurrent track** (`2b-timefit-slots`, time-fit
  slot bug) as of this session — do not edit it without checking in first, even for the swap
  query in Next #4.
- Adding a new migration going forward: edit the `.sql` file AND `packages/store/src/migrations/
  data.ts`'s matching constant, by hand, in the same commit — `migrate.test.ts` fails loudly if
  they drift (see ADR 0005).

### §10 done-criteria checklist (from the wave brief)
- [x] Generate -> approve -> run -> complete works end to end **in the test suite** against the
  real on-device driver (`HomeScreen.test.tsx` proves generate through Workout render; the
  store's own `simulation.test.ts`, unmodified, proves the rest of the chain through
  `completeSession` using the identical repository calls the screens use).
- [~] Same, **on the simulator**: Home confirmed rendering for real, post-fix
  (`03-home-screen-working-after-fix.png`). Could not tap through the rest of the loop physically
  in this environment (no UI-automation permission — see "Done" above). Not fully checked off.
- [~] Timed exercises, rest timer are implemented and wired to real store calls; audio/haptics are
  **not** wired (Next #7).
- [ ] Mid-workout swap — not implemented (needs an engine addition, see Next #4).
- [~] Force-quit mid-workout resumes at the exact set — mechanism proven at the store level
  (`lifecycle.test.ts`, file-backed per issue #10); no app-level test proves it yet (Next #3).
- [~] Timers do not drift across backgrounding — proven at the unit level with a real suspension
  simulation (`wallClockTimer.test.ts`); not re-verified against a real backgrounded device
  (Next #2 — the coordinator was explicit this still needs doing).
- [x] Completed session data in the store is correct (actuals, signals, progression updates) —
  `completeSession`'s own, already-verified behavior (Wave 3); `SummaryScreen` calls it with no
  reimplementation.
- [x] `npm run check` green; no engine or store logic reimplemented in the UI layer (grep
  confirms every mutation in `app/src/screens/*.tsx` and `app/src/components/*.tsx` is a
  `@roamfit/store`/`@roamfit/engine` call).
- [~] Screenshots/recorded run — three screenshots in `docs/handoff/evidence/` (two bugs, one
  working screen); not a full recorded walkthrough (see Next #1).

### Evidence
- `npm run check` (root): typecheck + lint + test + engine-purity, all green, at every commit
  boundary listed above. Latest counts: engine 851/851, store 31/31, data 2/2, app 9/9 (3 suites:
  `App.test.tsx`, `wallClockTimer.test.ts`, `HomeScreen.test.tsx`).
- `HomeScreen.test.tsx` (`npx jest --config app/jest.config.js --rootDir app HomeScreen.test`):
  renders the real `RootNavigator` inside `StoreProvider`, taps `quick-session-button`, and
  asserts the app lands on the Workout screen for a session that `generate` +
  `createPendingSession` + `startSession` really created and started against the on-device
  op-sqlite driver (not a stub).
- `docs/handoff/evidence/01-red-screen-missing-expo-linking.png` — first `expo run:ios` build,
  red screen: `Cannot find native module 'ExpoLinking'`. Fixed by adding `expo-linking`.
- `docs/handoff/evidence/02-red-screen-metro-cannot-resolve-node-fs.png` — second build, red
  screen: `Unable to resolve module node:fs from .../packages/store/src/migrate.ts`. Fixed by
  ADR 0005 (embedded migration SQL).
- `docs/handoff/evidence/03-home-screen-working-after-fix.png` — Home screen rendering correctly
  on the "iPhone 17 Pro" simulator after both fixes, driven by the real on-device store.
- Simulator setup notes for whoever continues this: `cd app/ios && pod install` (97/96 pods,
  Expo autolinking + Codegen picked up op-sqlite/react-native-screens/react-native-safe-area-
  context/expo-linking with no manual config plugin needed), then
  `npx expo run:ios --device "iPhone 17 Pro"` against an already-booted simulator. Port 8081 was
  occupied by an unrelated process on this machine (`/Users/mattwayles/Development/unpack`) —
  `expo start --dev-client --port 8082` run separately, then
  `xcrun simctl openurl "iPhone 17 Pro" "exp+roamfit://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"`
  to point the installed dev-client at it. `xcrun simctl io "iPhone 17 Pro" screenshot <path>`
  for screenshots.
