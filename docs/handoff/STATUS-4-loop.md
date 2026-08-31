## Track: 4-loop — Core workout loop (UI)
Last updated: 2026-08-30

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
  incompatibility. Confirmed with a throwaway probe, then used for real in
  `HomeScreen.test.tsx`.
- [x] **`app/src/db/` wiring per ADR 0003** (`23d5aaa`) — `app/src/db/index.ts` opens the
  on-device db via op-sqlite, runs `@roamfit/store`'s migration runner, returns a `Db` handle.
  Discovered along the way that ADR 0003's premise ("both drivers are sync, swapping is a
  constructor call") doesn't hold at the pinned `drizzle-orm@0.45.2` — `drizzle-orm/op-sqlite` is
  async-only. Recorded as **ADR 0004** and closed with `app/src/db/opSqliteSyncDriver.ts`, a
  ~250-line synchronous Drizzle driver over op-sqlite's `executeSync`/`executeRawSync`, modeled
  directly on `drizzle-orm/better-sqlite3`'s own driver/session classes. `packages/store` itself
  needed **zero changes**.
- [x] Two more real bugs found by actually exercising the driver against a live db (not just
  typechecking), both fixed in `app/src/db/index.ts` (`d852a7a`): op-sqlite's `executeSync` only
  accepts one SQL statement per call (unlike `better-sqlite3`'s multi-statement `.exec()`), and
  it rejects a leading `-- comment` line even ahead of one otherwise-valid statement. Migration
  files are now split into individual statements with full-line comments stripped first.
- [x] **Wall-clock timer controllers** (`ef03890`) — `app/src/lib/wallClockTimer.ts`:
  `createCountdownController` (rest timer, timed-exercise countdown) and
  `createStopwatchController` (timed-exercise "actual seconds held", elapsed workout time). Pure,
  no React, no ambient timers — every read re-derives from an absolute target instant and the
  injected clock, so there's no per-tick counter to lose ticks across a suspension. Tests in
  `wallClockTimer.test.ts` **jump the fake clock forward by a large amount between two calls with
  no tick in between** (simulating the JS thread being suspended while backgrounded/locked) and
  assert the displayed value is still correct — this is the specific verification bar the brief
  calls out, not a "advance a fake tick" test. 7 tests, all passing.
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
  really lands on a freshly created + started Workout screen. This is the concrete evidence that
  generate -> createPendingSession -> startSession -> render actually works, not just typechecks.
- [x] `npm run check` (typecheck + lint + test + engine-purity, all workspaces) green at every
  commit boundary above. Current counts: engine 851 tests, store 27, data 2, app 9 (3 suites).

### In progress / stopped here
Nothing mid-edit — every commit above is a clean, working checkpoint. The next increment has not
been started.

### Next
1. **Simulator run**: see "Evidence" below — a real `pod install` + `expo run:ios` was attempted
   against the already-booted "iPhone 17 Pro" simulator. Check this file's evidence section (I
   was updating it while the build ran in the background) for the actual outcome — if it's not
   filled in below, the build was still running when this track stopped; rerun
   `cd app && npx expo run:ios --device "iPhone 17 Pro"` and capture a screenshot with
   `xcrun simctl io booted screenshot <path>.png` once the app launches, walking Home -> Quick
   Session -> a couple of sets -> Summary -> FINISH.
2. **Mid-workout swap (§10.6)** — not implemented. It needs an engine-exposed "3-5 alternatives
   for this pattern slot, same progression level, all filters respected" query.
   `packages/engine/src/index.ts` doesn't export one (only `generateSession`/
   `generateQuickSession`, which pick a whole plan, not "give me alternatives for this one
   slot"). Implementing candidate selection in `app/` to fake this would put an exercise-
   selection decision in the UI layer, which directly violates this wave's core rule — so it was
   left undone rather than faked. **This needs a small, scoped `packages/engine` addition** (a
   function like `alternativesForSlot(library, families, userState, { pattern, anchorClass,
   progressionLevelId, excludeExerciseId }): Exercise[]`, reusing the existing filter/candidate
   machinery in `packages/engine/src/filters/` and `packages/engine/src/selection/` — grep those
   directories, the pieces likely already exist internally and just aren't exported). Once that
   exists, wire `sessionsRepo.recordSwap` (already implemented and tested in `packages/store`) to
   a real swap-picker UI in `WorkoutScreen.tsx`.
3. **Approval-time gaps**: `packages/store`'s sessions repository has `removeEntryAtApproval` and
   `adjustSetsAtApproval` but no `addEntryAtApproval` or `adjustRepTargetAtApproval` — "Add
   exercise" and "edit rep target" at approval (§10.3) aren't implemented for the same reason:
   no store mutation to call, and inventing one in `app/` would be new persistence logic, which
   CLAUDE.md forbids. Small, scoped `packages/store` additions, then straightforward UI wiring.
4. **"Regenerate with a note" / "Describe it instead"** (§10.2/§10.3) — routes through the online
   §7.1 LLM-intake path, out of scope for this wave's offline-first loop. Not started.
5. **Audio ducking, haptics, background rest-timer notification** (§10.8/§10.7) — not implemented
   at all. This is real remaining scope: `expo-av`/`expo-audio` for a ducked background audio
   session + 3-2-1/completion cue tones respecting the silent switch with an override,
   `expo-haptics` for start/halfway/completion pulses carrying the same info when muted, and
   `expo-notifications` for a local notification at rest-timer-zero so the rest timer really
   "works with the screen locked or the app backgrounded" (currently it only works foregrounded —
   the countdown math is wall-clock-correct on resume, but nothing fires while backgrounded).
6. **Rep-target editing at approval, superset "Round N of M" display, native share sheet on the
   level-up/milestone screen (§9.10)** — all noted inline in the relevant screen's file comment,
   none implemented.
7. Component tests beyond `wallClockTimer.test.ts` and `HomeScreen.test.tsx` — Approval's
   remove/adjust-sets, the rest timer's `+15s`/`-15s`/Skip against `useCountdown`, and the
   feedback controls' "tap the same emoji clears it" unset semantics would all benefit from a
   focused RNTL test each. None of the screens are business-logic-bearing, so this is lower risk
   than it looks, but it's still undone.

### Decisions / gotchas
- **Navigation**: `@react-navigation/native` + `@react-navigation/native-stack` — boring, widely
  supported, the standard pairing for Expo. **No separate client-state library** (no Redux/
  Zustand/Jotai): every screen reads directly from `@roamfit/store` via `useStore()`
  (`app/src/state/StoreContext.tsx`) and re-fetches with `useFocusEffect`/local `useState` after
  each mutation. There is no cross-cutting UI state that isn't already owned by the store, so a
  second state system would just be a duplicate source of truth.
- **`WorkoutScreen` is one screen, not three routes** (Active-reps / Active-timed / Rest as
  separate navigator screens would remount on every phase transition, which is exactly what the
  wall-clock timer architecture is designed to survive gracefully but shouldn't need to). Phase
  (`'exercise' | 'resting'`) is local component state; each phase's sub-view is given a `key`
  (`${entry.id}-${setIndex}`) so React remounts it on the next set, which gives each set/rest a
  **fresh** `useCountdown` controller rather than trying to reset a shared one.
- **Crash-safety resume is intentionally "dumb"**: `findCurrent()` in `WorkoutScreen.tsx` just
  scans `session.entries` in plan order and returns the first entry whose `setLogs.length < sets`
  — no separate "cursor" stored anywhere in `app/`. This mirrors `packages/store`'s own
  `lifecycle.test.ts` crash-safety test exactly (same "reconstruct from `set_logs` rows" rule) —
  a force-quit resumes correctly because there was never any other state to lose. Not yet proven
  with an app-level test (store's own test already proves the underlying data survives a real
  close+reopen; an app-level test that force-quits mid-`WorkoutScreen` and remounts would be the
  next increment for "attach evidence the loop actually runs" beyond what's here).
- **op-sqlite's Node build is real enough to run tests against.** `app/src/db/index.ts`'s
  `getDb()` runs unmodified inside Jest (jest-expo's `jest-environment-jsdom` + this project's
  `transformIgnorePatterns` fix, see `app/jest.config.js`) and actually opens/migrates a real
  sqlite file on disk (`roamfit.sqlite`, gitignored — see `.gitignore`). This is why
  `HomeScreen.test.tsx` is real evidence and not a mock-heavy illusion: the exact same `getDb()`
  the simulator will call is what the test calls.
- `app/src/lib/useCountdown.ts`'s `TimedExercise` sub-component (in `WorkoutScreen.tsx`) chains
  two `useCountdown` instances (a 3s get-ready, then the main duration) with a couple of
  `useEffect`s reacting to each other's ticks. It works (typechecks, and is exercised indirectly
  by `HomeScreen.test.tsx` whenever Quick Session happens to pick a timed exercise) but is more
  fragile than the reps path — a future pass should consider collapsing it into one controller
  with an internal "get ready then run" state rather than two coordinated ones.
- **Do not add a second sync SQLite driver or hand-roll SQL in `app/`.** Everything from
  `sessionsRepo`/`usersRepo`/`exerciseStateRepo`/`progressionStateRepo`/`statsRepo` +
  top-level `generate`/`completeSession` already covers what this wave's screens need except the
  two gaps above (swap-candidates, approval add/edit) — check there again before writing a new
  store call.

### §10 done-criteria checklist (from the wave brief)
- [x] Generate -> approve -> run -> complete works end to end **in the test suite** against the
  real on-device driver (`HomeScreen.test.tsx` proves generate through Workout render; the
  store's own `simulation.test.ts`, unmodified, proves the rest of the chain through
  `completeSession` using the identical repository calls the screens use).
- [ ] Same, **on the simulator** — attempted this session; see Evidence below for the actual
  outcome.
- [x] Timed exercises, rest timer implemented with audio/haptics **not yet wired** (see Next #5).
- [ ] Mid-workout swap — not implemented (needs an engine addition, see Next #2).
- [ ] Force-quit mid-workout resumes at the exact set — the underlying mechanism is proven at the
  store level (`lifecycle.test.ts`'s crash-safety test, now file-backed per issue #10) and
  `WorkoutScreen.tsx`'s resume logic is the same "scan for first incomplete entry" rule, but no
  app-level test forces a real remount to prove it end to end yet.
- [x] Timers do not drift across backgrounding — verified with a test that actually simulates
  suspension (`wallClockTimer.test.ts`), per the brief's explicit bar.
- [x] Completed session data in the store is correct (actuals, signals, progression updates) —
  this is `completeSession`'s own, already-verified behavior (Wave 3); this wave's `SummaryScreen`
  calls it with no reimplementation.
- [x] `npm run check` green; no engine or store logic reimplemented in the UI layer (grep
  confirms every mutation in `app/src/screens/*.tsx` and `app/src/components/*.tsx` is a
  `@roamfit/store`/`@roamfit/engine` call).
- [ ] Screenshots or a recorded run — see Evidence.

### Evidence
- `npm run check` (root): typecheck + lint + test + engine-purity, all green, at every commit
  boundary listed above. Latest counts: engine 851/851, store 27/27, data 2/2, app 9/9 (3 suites:
  `App.test.tsx`, `wallClockTimer.test.ts`, `HomeScreen.test.tsx`).
- `HomeScreen.test.tsx` (`npx jest --config app/jest.config.js --rootDir app HomeScreen.test`):
  renders the real `RootNavigator` inside `StoreProvider`, taps `quick-session-button`, and
  asserts the app lands on the Workout screen for a session that `generate` +
  `createPendingSession` + `startSession` really created and started against the on-device
  op-sqlite driver (not a stub). This is what caught both op-sqlite migration bugs recorded above
  — the test failed against the real driver before those fixes, which is exactly the point of
  writing it against the real thing instead of mocking `@roamfit/store`.
- Simulator: `cd app/ios && pod install` completed successfully (97 dependencies, 96 pods,
  picked up op-sqlite/react-native-screens/react-native-safe-area-context via Expo autolinking
  and Codegen with no manual config plugin needed). `npx expo run:ios --device "iPhone 17 Pro"`
  (an already-booted simulator in this environment) was launched; <fill in outcome here — if this
  line is still here unedited, the run had not finished when the session ended; check
  `/tmp/expo_run_ios.log` for the tail of what happened>.
