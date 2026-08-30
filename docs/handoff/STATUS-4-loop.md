## Track: 4-loop — Core workout loop (UI)
Last updated: 2026-08-30

### Done
- [x] Read ramp-up docs: wave-04 brief, ORCHESTRATION carried-forward items 6/8/10/13,
  STATUS-3-persistence "Next" section, ADR 0002 (15-min floor), ADR 0003 (store package split).
- [x] Read `packages/engine/src/index.ts` and `packages/store/src/index.ts` public surfaces, and
  `packages/store/src/simulation.test.ts` (the generate -> createPendingSession -> startSession ->
  logSet -> completeSession flow this wave's UI must follow, not reinvent).
- [x] **Carried-forward issue #10** (small, authorized store change): added `createFileTestDb()` /
  `FileTestDb.reopen()` to `packages/store/src/testHarness.ts` — opens a real file-backed
  better-sqlite3 db in a temp dir, `reopen()` closes the connection and opens a brand-new one
  against the same file (no re-run of migrations, matching a cold app relaunch). Rewired
  `packages/store/src/lifecycle.test.ts`'s "crash safety" test to use it: it now actually closes
  the connection after logging two sets and cold-reopens the same file before asserting resume,
  instead of reusing one live `:memory:` connection end to end. `npm run check` green at this
  point (commit below).

### In progress
- Not yet started: app dependency setup (navigation library choice), `app/src/db/` op-sqlite
  wiring per ADR 0003, or any screen. Next action is exactly that — see "Next".

### Next
1. **Retry carried-forward issue #6** first: try `@testing-library/react-native` in `app/`
   (`npm install --workspace app -D @testing-library/react-native`) and write one throwaway
   render test to see if `render()` still comes back empty under this Expo/RN/jest-expo/React 19
   combination. Record the exact result (pass or the empty-object failure) in this file before
   moving on. If it still fails, fall back to `react-test-renderer` as Wave 1 did and note why.
2. Pick navigation + state libraries and record the one-line rationale here. Likely candidates:
   `@react-navigation/native` + `@react-navigation/native-stack` (boring, standard for Expo) for
   navigation; no extra state library needed at first — session/db data can live in a small
   context + hooks reading directly from `@roamfit/store` repositories, since the store already
   owns all state transitions and there is no cross-cutting client state to justify Redux/Zustand.
   Decide only once actually wiring screens, and write the rationale down when decided.
3. Wire `app/src/db/` (op-sqlite + `drizzle-orm/op-sqlite`) per ADR 0003 — this is the ONLY file
   that may import `@op-engineering/op-sqlite`. It opens the on-device db, wraps with
   `drizzle-orm/op-sqlite`, and passes the handle to `createStore`/`createTestDb`-equivalent from
   `@roamfit/store`. `packages/store`'s `src/migrate.ts` migration runner is driver-agnostic — use
   it here too (do not hand-roll a second migration path).
4. Then follow the suggested increment order from the brief: db wiring + navigation + app shell
   (1) -> Home (2) -> Generate (3) -> Plan approval (4) -> Active rep-based (5) -> Rest timer (6)
   -> Active timed (7) -> mid-workout swap (8) -> Summary (9) -> device behavior: keep-awake,
   audio ducking, haptics, background (10). Land tests with each piece, per CLAUDE.md commit
   discipline (small, `npm run check` green at every boundary, commit with explicit pathspecs).
5. Wall-clock timer test requirement (verification item, not optional): the rest/timed-exercise
   timer must be driven by an injected clock (`Date.now`-like), and its test must simulate real
   elapsed wall-clock time passing between two ticks (e.g. clock jumps forward 90s between one
   `advanceTimersByTime` step and the next, simulating the JS timer not firing while
   backgrounded/suspended) and assert the *displayed* remaining/elapsed value is correct on
   resume — not just that a tick counter incremented.
6. Screenshots or a described simulator run must be attached to this file as evidence before
   declaring the loop done — `npm run ios` / `expo run:ios` on the simulator, or an honest note if
   the sandboxed environment cannot complete an Xcode build (check early, don't assume).

### Decisions / gotchas
- `packages/store/src/testHarness.ts` now exports both `createTestDb()` (unchanged, `:memory:`,
  used by every other store test) and the new `createFileTestDb()` (file-backed, only for tests
  that need to prove durability across a real close/reopen). Don't switch every store test to the
  file-backed harness — `:memory:` is faster and fine for anything that isn't specifically testing
  durability; only `lifecycle.test.ts`'s crash-safety test needed the change.
- No UI code exists yet beyond the Wave 1 placeholder `app/App.tsx` — treat this as a from-scratch
  build following the wave-04 brief's suggested increment order.
- Reminder to self (and next agent): this wave writes **no business logic** — every prescription,
  exercise choice, progression decision, and persistence write goes through `@roamfit/engine` /
  `@roamfit/store`'s existing exported functions. If a component needs to compute anything
  domain-specific, that's a sign the store/engine is missing an export, not a place to inline SQL
  or math in `app/`.

### Evidence
- `npm run check` full run (typecheck, lint, test, engine-purity) green after the testHarness
  change — 851 engine tests, 27 store tests (up from 26; crash-safety test now does a real
  close+reopen), 2 data tests, 1 app placeholder test, all passing. No simulator run yet — no app
  code exists to run.
