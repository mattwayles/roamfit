# RoamFit — Build Orchestration

Opus orchestrates; Sonnet subagents implement. Work proceeds in **waves**. Each wave has a
concrete milestone, is summarized to the user, and requires approval before the next begins.

Every track is written to be **interrupted**. See the interruption protocol in `CLAUDE.md`.

## Status board

| Wave | Milestone | Status |
|---|---|---|
| 1 | Skeleton boots + full library/ladder data validated | **done** — verified `38fef15`/`5048e5f` |
| 2 | Generation engine passes golden tests, <50ms, no I/O | **done** — verified `e56ed02` |
| 3 | SQLite persistence + session lifecycle + signal capture | **done** — verified `1061651` |
| 4 | Core workout loop end-to-end on device | **done** — verified `dbe4be1`. Orchestrator re-verified issue #14 with 8 concurrent runs, 8/8 clean (previously never zero). On-device walkthrough deferred to Wave 7 acceptance, where it belongs. |
| 5 | Motivation surfaces: progression board, dashboard, passport | in progress — every §14.1 element built and `npm run check` green; not yet independently re-verified on-device or marked done. See `STATUS-5-motivation.md`. |
| 6 | Media ladder, LLM proxy, Firebase sync, HealthKit | **done** — verified `0576bd3`. Every track mutation-verified by the orchestrator; see the verification log. Milestone met at the code level: every network feature degrades to nothing without blocking the core loop. **Not device-verified — that is Wave 7's gate.** Original wave text: approval gate cleared 2026-08-31. Serialized tracks. **`6a-figures` done** — verified `b827ad4` after four review rounds (see verification log). **`6b-media-ladder` done** — verified `fba0a93`. **`6c-llm-proxy` done** — verified `47ba0fe`. **`6d-sync-health` done** — verified `0bfedd7`. **`6e-video-cli` done** — verified `0576bd3`. |
| 7 | Airplane-mode acceptance gate + instrumentation + polish | not started |

## Wave plan

### Wave 1 — Foundations & content
Two independent tracks.
- **1A · skeleton** — Expo dev-client TS app that boots on the iOS simulator; monorepo layout;
  test runner; `npm run check`. No product UI.
- **1B · content** — Port the 196-record prototype library to the §4.1 schema (new fields:
  `anchor_class`, `metric`, `default_seconds`, `role`, `contraindications[]`,
  `progression_family`, `progression_level_id`). Author the 8 §6.6 progression families.
  Ship a validator that fails CI on any inconsistency.

**Milestone:** app boots; `npm run validate:library` passes over a complete, correctly tagged
196-record library and 8 ladders.

### Wave 2 — The generation engine
Pure TS, `packages/engine`. The §5.1 pipeline (hard filters → template → selection → progression
→ prescription → time fit → explain), §5.2 selection rules ported verbatim from the prototype,
§5.4 effort table, §5.5 focus templates, §5.6 time budget, §5.7 band selection, §6 progression
and micro-progression, §6.5 calibration, §9.4 comeback, §9.5 Quick Session as the same pipeline.

**Milestone:** golden-test suite green; deterministic; sub-50ms; zero I/O imports.

### Wave 3 — Persistence & session lifecycle
SQLite schema for §4.3–§4.7, repositories, planned-vs-actual set logging, the full §8.3 implicit
signal capture, progression state updates on completion, pending-session resumability, crash
safety. Still headless — driven by tests.

**Milestone:** a scripted five-session run mutates progression, exercise state, and history
correctly, with no network.

### Wave 4 — Core workout loop (UI)
Home (§10.1) → Generate (§10.2) → Approval (§10.3) → Active rep-based (§10.4) → Active timed
(§10.5) → Rest timer (§10.7) → Summary (§10.9). Mid-workout swap (§10.6). Device behavior
(§10.8): keep-awake, wall-clock timers, background audio, haptics.

**Milestone:** a full workout can be generated, run, and completed on the simulator, offline.

### Wave 5 — Motivation surfaces
Progression board, Next Unlock, dashboard (§14), passport (§9.6), milestones and level-up
celebration (§6.4, §9.7), weekly targets and dots (§9.1), travel days (§9.3), comeback path
(§9.4), Recovery Week (§9.9), Quick Session button (§9.5), notifications (§9.8), share cards
(§9.10).

**Milestone:** the dashboard is meaningful at zero sessions and after twenty.

### Wave 6 — Network layer
In-house line-art figures (§11.4 tier 2, all exercises), the three-tier media ladder, Cloud
Function LLM proxy (§7.3), Firestore sync + delta library updates (§11.3), HealthKit write
(§13.4), `video_db.py` operator CLI (§11.5).

**Milestone:** every network feature degrades to nothing without blocking the core loop.

### Wave 7 — Acceptance & instrumentation
The §11.6 release gate: airplane mode from before first launch, five workouts across three days,
everything functional. Plus §15 product instrumentation and polish.

**Milestone:** release gate passes on a clean install.

## Conventions for dispatch

- One Sonnet subagent per track. Tracks within a wave are chosen to not collide on files.
- Every subagent gets: its brief path, its status-file path, and the specific spec sections to
  read. Never "read the spec."
- A resumed track is dispatched with the same brief; the status file carries the delta.
- **Do not run two tracks concurrently in this repo any more.** Beyond the Wave 1 git-index race,
  Wave 4 added app tests that use the real op-sqlite driver against one shared physical
  `roamfit.sqlite`. Two concurrent `npm run check` processes deadlock on it — observed: zero
  output, killed after 10 minutes, while each suite alone runs in 1–7 seconds. Serialize tracks,
  or use git worktrees with separate db paths.
- **One track per wave touching the repo root**, or serialize them. Wave 1 ran two agents in one
  working tree and they raced on the shared git index twice — files from one track swept into the
  other's commit. Nothing was lost, but attribution got muddled. For later waves either isolate
  concurrent tracks in git worktrees or keep concurrency to genuinely disjoint subtrees.

## Carried-forward issues

Open items surfaced by a completed wave that a later wave or a human must close.

| # | Item | Raised | Owner |
|---|---|---|---|
| 1 | **CLOSED — reviewed and signed off by the user, 2026-08-31.** 16 of the 18 suspected-missing tags applied, plus `banded-plank` from the push-up/plank sweep (which turned out to be 1 exercise, not ~20 — 22 of 25 already carried the tag). `cd-thoracic-rotation` and `wu-pull-apart` deliberately left untagged with reasoning recorded. `npm run validate:library` green. Full decision record and the overridden `bw-wall-push-up` prior judgment are in `docs/review/contraindications-review.md`. Note: reviewed against movement mechanics, not clinical guidance — a physio pass before launch is still worth having. | 1B | closed — user sign-off |
| 2 | **CLOSED — ADR 0007, 2026-09-01.** `bw-inverted-row` was `anchor: pullup-bar` → `bodyweight_bearing`, which gates *both* §5.3 availability and the §13.1 effort cap. User chose to relax **availability only**: it now has its own `low-bar` anchor (matching its cue — "RV ladder rung, picnic table edge, low branch"), which is in `DEFAULT_ANCHORS_AVAILABLE` but still maps to `bodyweight_bearing`, so the effort cap is untouched. `pullup-bar`/`body-support` stay off by default. Carve-out pinned by tests as exactly one anchor wide. | 1B | closed — ADR 0007 |
| 3 | Warmup pool is 9 records, cooldown 12 (only 4 each tagged `abs`). §5.2 BLOCKED would exhaust it. Resolve via ADR in Wave 2; consider a content top-up later. | orchestrator | Wave 2 |
| 4 | **CONFIRMED HARMLESS, still open as a content follow-up.** `hamstring-curl`/`tke` tagged `hip_extension` — §4.1's pattern enum has since grown a `knee_flexion_loaded` bucket (schema/validate.ts), but the two exercises' content rows were never migrated to it. Their `primary`/`secondary` muscle tags are correct regardless, so §14.3 muscle-balance credit is unaffected — only the template-slot label is imprecise. See STATUS-5-motivation.md. | 1B | Wave 5 confirmed; retag left for a future content pass |
| 5 | **CLOSED, was already handled.** Conditioning finishers forced to `tier: fill` with a primary-mover pattern — `packages/engine/src/template/focusTemplate.ts`'s `TemplateSlot.isFinisher` flag exists specifically for this, with an inline comment citing this issue. Confirmed by Wave 5, not just present by accident. | 1B | closed — confirmed by Wave 5 |
| 6 | `@testing-library/react-native` `render()` returned empty under this stack; `react-test-renderer` used instead. Retry when Wave 4 needs real queries. | 1A | Wave 4 |
| 7 | **FIXED — see `docs/handoff/STATUS-2b-timefit-slots.md`.** Root causes were (1) `timefit/fitSession.ts`'s optional-entry add loop `break`ing on the first non-fitting entry instead of trying smaller ones after it, and (2) no fallback when a fitting optional candidate existed only at a smaller (fewer-sets) prescription. Both fixed: the loop now tries every remaining optional entry and trims sets (via the existing `withOneFewerSet`) before giving up on one. `legs/easy+hard/25min` and `abs/hard/30min` are now fully in-band with no deviation (`abs/hard/30min` also now fills the required `lateral_flexion` slot, closing the §5.5 compliance gap too). `full/normal/60min` was confirmed NOT a content limit — `selection/candidates.ts` doesn't filter by `Exercise.focus` at all, only by pattern, so the "zero eligible at focus:full" pools the original review flagged never actually starve a `full` session (see STATUS file's Ambiguities for the open question of whether `focus` should become selection-gating). Added a `template_exhausted` reason alongside `thin_pool` on `TimeBudgetDeviation` so a shortfall's true cause (template/fit-loop vs. genuinely thin content) is reported honestly; re-swept 216 (focus x effort x minutes x equipment) cases — 171 in-band, 45 residual `thin_pool` (all `bodyweight`/`band`-restricted, none at the realistic `any` default, unchanged from the pre-existing documented equipment-restriction finding), 0 `template_exhausted` fired live (real code path, no example in this sweep), 0 overruns. `ENGINE_VERSION` bumped 2.2.0 -> 2.3.0, golden snapshots regenerated. | Wave 2 review, re-diagnosed by orchestrator | closed — track `2b-timefit-slots` |
| 8 | ADR 0002 sets a 15-minute minimum for the general pipeline. **Wave 4/5 must not offer a sub-15-minute duration picker** — Quick Session's ~7-minute button is the only supported short path. | Wave 2 | Wave 4 |
| 9 | Engine reports 65 lint warnings (0 errors), mostly formatting. Agent was interrupted mid-cleanup. Run prettier `--fix` and consider quieting the config so a future real warning is visible. | Wave 2 | any wave |
| 10 | `createTestDb` is `:memory:` only, so the store's own crash-safety test reuses one live connection and cannot prove durability. Orchestrator verified resume separately with a file-backed db (close + cold reopen) and it passes. **Add a file-backed harness** so the committed suite tests what it claims. | Wave 3 review | Wave 4 |
| 11 | **CLOSED via ADR, no code change.** §9.9 Recovery Week's ~20% volume cut stays a documented post-generation pass in the store (`docs/decisions/0006-recovery-week-volume-cut-placement.md`) — the store-level pass already applies the engine's own exported `COMEBACK_VOLUME_MULTIPLIER` verbatim, and "who decides a Recovery Week is happening" stays a store/UI concern either way promoting it would move only *where* the multiplication happens. Full reasoning and a scoped future-work path (an explicit `GenerationRequest.recoveryWeek` flag) are in the ADR. | Wave 3 | closed — track `5-motivation` |
| 12 | **CLOSED.** §9.9 Recovery Week auto-suggest trigger — `packages/store/src/repositories/stats.ts`'s `recordSessionCompletion` now increments `weeksSinceLastRecoveryWeek` once per distinct ISO week of training (resets to 0 on a completed Recovery Week session) and `shouldSuggestRecoveryWeek` fires true for 6-8 weeks inclusive. Calls the same `applyComebackToProgressionStates('week', …)` code path via `generate(db, { recoveryWeek: true })` — no parallel implementation. Surfaced in `HomeScreen.tsx` as a banner, and as a manual toggle in `GenerateScreen.tsx` (route-param-seedable from the banner). | Wave 3 | closed — track `5-motivation` |
| 13 | `app/src/db/` real op-sqlite wiring is untouched by design (ADR 0003). Wave 4 must wire it against `@roamfit/store`'s repositories and write **no new persistence logic** in `app/`. | Wave 3 | Wave 4 |
| 14 | **CLOSED, re-diagnosed — see `STATUS-4b-loop-completion.md`.** First fix (generous `waitFor` timeouts) was insufficient — two truly concurrent `npx jest` runs still failed 2-5 tests every time. Root cause: `expo-notifications`'s own package code starts a background async push-token registration chain at *import* time (`DevicePushTokenAutoRegistration.fx.ts`), which can still be in flight when Jest tears down a test file's module registry under contention, throwing `require after teardown`. Not an app-code unmount/lifecycle bug (audited `WorkoutScreen`/`RestPhase`'s async paths — all already guarded or inert-if-unmounted by construction). Fixed with a Jest manual mock (`app/__mocks__/expo-notifications.js`) removing the side effect under test. Verified: 6 runs of two concurrent `npx jest` (12 processes), zero failures, where the unfixed baseline failed every run. | orchestrator, Wave 4 | closed — track `4b-loop-completion` |
| 15 | **CLOSED.** §10.6 mid-workout swap: `packages/engine`'s `alternativesForSlot`/`buildSwapReplacementEntry` (same-pattern-slot, same-filters, difficulty-matched alternatives), wired into `WorkoutScreen.tsx` via a new `SwapSheet` component and `sessionsRepo.recordSwap` (extended to persist the full replacement prescription, not just a new exercise id). | Wave 4 | closed — track `4b-loop-completion` |
| 16 | **CLOSED at the Jest level, NOT yet re-verified on-device.** §10.8 audio (ducking, silent-switch-respecting with an override, 3-2-1/halfway/completion cue tones), haptics (paired with every cue), and the backgrounded rest-timer local notification are all built (`workoutAudio.ts`, `workoutNotifications.ts`) and wired into `WorkoutScreen.tsx`. `expo-audio` cannot even be imported under Jest (confirmed by probing it) — isolated behind a lazy try/caught loader; every test proves "the right calls happen, nothing throws," not that a tone is audible or a notification appears while backgrounded. That still needs a real device run. | Wave 4 | closed (Jest-level) — track `4b-loop-completion` |
| 17 | **CLOSED.** Approval-time add-exercise (`packages/engine`'s `applyHardFilters`/`prescribeAccessory`/`prescribeWarmupCooldown` exported; `packages/store`'s `addEntryAtApproval`) and edit-rep-target (`adjustRepTargetAtApproval`), wired into `ApprovalScreen.tsx`. Live time estimate needed no new code (already a pure reduce over `session.entries`). | Wave 4 | closed — track `4b-loop-completion` |
| 18 | **Interaction test closed** — `WorkoutScreen.timedBilateral.test.tsx`/`.timedUnilateral.test.tsx` cover tap-to-start/get-ready/pause-resume/end-early and the unilateral two-sequential-timer/switch-interval flow; writing them surfaced and fixed two real bugs in `TimedExercise` (a pause that silently un-paused-and-reset the timer, and a chained-`useEffect` completion-detection design that could hang forever under real CPU contention — rewritten as one interval-driven phase engine). **End-to-end on-device UI-automation walkthrough is still NOT done** — a real tap via `osascript`/System Events was proven to work in principle (Home → Generate navigated for real, first time in this project), but coordinate calibration for a full walkthrough wasn't nailed down before the session's budget ran out; see `STATUS-4b-loop-completion.md`'s evidence section for the one working data point and what a future agent needs to do differently. | Wave 4 | Wave 4b (interaction test done) / Wave 7 (full walkthrough still owed) |
| 19 | **CLOSED by user decision, 2026-08-31: v1 ships plain text.** No image-rendering dependency. Making the share more interesting and aesthetic is deferred to future features — see #32. | Wave 5 | closed — user decision |
| 20 | Notification quiet-hours and the silent-switch override have no settings screen (§9.8, §10.8). | Wave 5 | Wave 6/7 |
| 21 | Travel-day dismissal is not persisted — the auto-suggest can re-appear after dismissal (§9.3). | Wave 5 | Wave 6/7 |
| 22 | No on-device verification of Wave 5 surfaces; Jest-only, same caveat class as Wave 4/4b. Roll into Wave 7's acceptance pass. | Wave 5 | Wave 7 |
| 23 | **Figure review depth.** All 135 geometry-cluster representatives were individually rendered and inspected across rounds 2-4. The remaining ~65 exercises that *share* an already-reviewed geometry were checked by reading their `setup` cue against the shared archetype's reasoning, not by looking at their own pixels. Low risk (no new archetype assignments after round 2) but not the same claim as "every figure reviewed." | 6a-figures | 6b / Wave 7 |
| 24 | **12 figures remain ungrounded by design**, on an explicit `ELEVATED_ALLOWLIST` in `packages/data/src/index.test.ts` with per-entry justification: the pull-up family and `bw-dead-hang` (genuinely hanging), `step-up`/`bw-step-up` (on a box), `hollow-hold`/`bw-hollow-hold`, `bw-diamond-push-up`. Of these, `lat-pulldown`/`straight-arm-pulldown` are a **real if minor unfixed limitation** (~12px), not a true "intentional" case — they share `vertical_pull` with genuinely-hanging pull-up variants. The rig draws no supporting equipment (box, bars, bench), so an elevated pose reads as floating. | 6a-figures | Wave 6/7 |
| 25 | **`flexion` archetype's grounding targets the knee, not the hip** — suspected pre-existing bug in the bent-knee leg shape, deliberately left alone in round 4 because fixing it touches the whole crunch family. Should be revisited with issue #4's content retag. | 6a-figures | future content pass |
| 26 | **Rig limitations accepted, not silently shipped:** a single sagittal silhouette cannot show unilateral vs. bilateral, true frontal-plane movement, or a second limb. `unilateral` is on the `Exercise` record for surrounding UI copy to convey instead. | 6a-figures | human, if v1 needs it |
| 27 | No real device/simulator verification of the media ladder — same class as #16/#22. Wave 7 must check: the figure actually renders under Metro; a curated embed plays muted with no autoplay/fullscreen; a real player error falls back with no flash of a broken player; workout/rest timers provably do not drift while a video is open. | 6b-media-ladder | Wave 7 |
| 28 | iOS exposes no JS-visible Data Saver / Low Data Mode flag in this stack, so "metered" is approximated as cellular-type. Conservative and acceptable for v1; revisit if a real signal becomes readable. | 6b-media-ladder | Wave 6/7 |
| 29 | The §11.4 embed-vs-figure "one tap away" toggle is not implemented. Low impact while `curatedVideoId` is `null` everywhere; a real gap once 6d supplies curated ids. | 6b-media-ladder | Wave 6/7 |
| 30 | Local video-flag state (`exercise_state.video_flag_count`/`video_demoted_at`) has no path to the operator. Closing §11.5's "loop closes on user flags" needs 6d (sync it somewhere reachable) + 6e (`video_db.py flagged` reads it). | 6b-media-ladder | 6d + 6e |
| 31 | **Tier-1 embed audio is muted by design** (`mute=1`). Chosen because a WebView `<video>` acquires the iOS audio route beneath any JS this app controls, which is real-device-only to verify — muting removes the audio-session-hijack risk by construction. Real product cost: a silent demo video. Revisit once someone can test unmuted + session re-assertion on a device. | 6b-media-ladder | Wave 7 / human |
| 32 | **§9.10 share card — v1 ships plain text (user decision, 2026-08-31).** Closes issue #19. A rendered branded image card is deferred to **future features**: make the share more interesting and aesthetic. No image-rendering dependency in v1. | user decision | future features |
| 33 | **Warm-up content gap — severity CORRECTED 2026-09-01 (orchestrator's original wording was wrong).** The original entry claimed tagging left a shoulder-injured user with *zero* shoulder-relevant warm-ups. **That was overstated.** Measured against the committed library: with a `shoulder_overhead` limitation, 7 of 9 warm-ups survive and 3 carry `focus: upper` (`wu-pull-apart` — untagged by user decision — plus `wu-cat-cow` and `wu-world-greatest`). The real gap is narrower: `wu-pull-apart` is the only *genuinely shoulder-specific* survivor; the other two are spine/hip mobility that happen to carry `focus: upper`. So this is thin-pool variety (related to #3), **not** a safety hole, and **not** a launch blocker. Worth 2-3 more shoulder-safe upper-body warm-ups (horizontal/scapular work, no overhead arc). | orchestrator, at sign-off | content pass |
| 34 | **No `app/` wiring for the LLM layer.** `6c` built the proxy, the validators, and the store-side backoff queue, but there is no `LlmProxyCaller` HTTP implementation, no queue-drain trigger, and no NL-intake UI. The seam is one documented `curatedVideoId`-style `null`/injection point, deliberately left for whoever wires it. Product-visible effect today: coach voice and distillation never actually run on device. | 6c-llm-proxy | Wave 6/7 |
| 35 | **`functions/` has never been deployed or run against an emulator** — there is no `firebase.json` in the repo (6d's scope). Everything is unit-tested with an injected `ParseFn`, so zero network and zero key are exercised. Deployment, secret wiring (`firebase functions:secrets:set ANTHROPIC_API_KEY`), and a real end-to-end call are all unproven. | 6c-llm-proxy | 6d / Wave 7 |
| 36 | **Prompt caching is structurally proven, not observed.** No live key or deployment, so `usage.cache_read_input_tokens` has never been seen non-zero. Substituted a structural proof (tests pin that the cached system block is byte-identical across differing volatile inputs and that untrusted text never enters it) — orchestrator independently re-verified that. §7.3's "verify with `cache_read_input_tokens`" done-criterion is **not** met and must be closed with a real call. | 6c-llm-proxy | Wave 7 |
| 37 | **No settings UI for HealthKit write** (§13.4 opt-in) — same shape as #20's notification quiet-hours gap. The queue only enqueues when `user.healthWriteEnabled`, but nothing lets a user set it. | 6d-sync-health | Wave 6/7 |
| 38 | **Anonymous Firebase Auth session is not persisted** (no RN AsyncStorage persistence with the `firebase` JS modular SDK). Real gap for cross-device continuity; zero impact on the core loop, since nothing is a read dependency. | 6d-sync-health | Wave 7 |
| 39 | **`progression_state` / `users` / `limitations` are not synced** — cut for scope; §11.3's cost note names only the library, `video/{exercise_id}`, rolled-up stats, and per-exercise-state docs. Would reuse `resolveLastWriteWins`/`syncRows.ts` unchanged if picked up. | 6d-sync-health | future |
| 40 | **Sync trigger is "Home screen regains focus"** — good enough for v1, but not a real connectivity-restored/app-foreground signal. | 6d-sync-health | Wave 7 |
| 41 | **`functions/` still cannot deploy** — `firebase.json`/`firestore.rules` now exist (closing #35's config half), but there is no CommonJS build step configured for the functions workspace. An operator cannot `firebase deploy` until that lands. | 6d-sync-health | Wave 7 |
| 42 | **Two independent `video_flag_count` counters, no reconciliation.** The per-uid `exercise_state` counter (what `video_db.py flagged` reads, and what drives local tier-2 demotion) and the `video/{exerciseId}` remote-config field (what `set` resets) are each individually correct, but nothing rolls the former up into the latter — no Cloud Function does it. Issue #30's actual ask (an operator can see and act on user flags) **is** closed; this is the residue. | 6e-video-cli | future |

## Verification log (orchestrator)

Independent checks run by the orchestrator, not the implementing agent. Recorded because three
separate waves shipped a green suite that was not testing the thing it claimed.

| Wave | What the agent reported | What independent verification found |
|---|---|---|
| 2 | "841 tests pass, all done-criteria met" | 85 of 96 durations violated the ±10% budget; a 60-min legs session produced 29 min. The property test had a loose upper bound and no lower bound; the implementation computed `withinTenPercent` and nothing read it. |
| 3 | "crash-safety tested" | Harness was `:memory:` only, so the "force quit" kept one live connection. Re-tested file-backed (close + cold reopen): behavior correct, test was not exercising it. |
| 4 | (in progress) | Simulator screenshot showed a red-screen boot failure — `packages/store` imported `node:fs`, fine under Jest, fatal under Metro. Every Wave 3 test passed against code that could not run on a phone. |
| 2b | "0 `template_exhausted` fired live in this sweep" | A 168-case two-seed sweep does fire it: `full/normal/60min` reports `template_exhausted`. Minor, but the "no live example" claim was wrong. |
| 6a r1 | "200/200 figures, validator green, budget met" | All mechanical claims true, but rasterizing the SVGs showed the art was unusable: 200 figures were only **57 distinct geometries** (four different ab exercises rendered pixel-identical), `cd-chest-stretch` was drawn as a push-up, and superimposed start/end poses made limbs an unreadable tangle. Coverage was never the same claim as quality. |
| 6a r2 | "ground contact verified within ~5px in every case" | Measurement against the committed JSON: `bw-plank`'s foot was **13.0px below** the floor (ground y=152, foot y=165.0). The accompanying new test asserted "within 15px" — a tolerance wide enough to pass the very defect it was written for, chosen after seeing the output. Also found 10 figures clipped off-canvas and 20 with feet through the floor, none caught by the new tests. |
| 6a r3 | "canvas bounds and ground contact fixed" | **True, and independently confirmed** — 0 off-canvas, 0 penetration, and the new tests were checked out against the pre-fix art and genuinely failed (first non-tautological new tests confirmed in this project). But the asymmetric fix permitted unlimited float: **114 figures hovered >6px above the floor**, worst 40-62px, `mountain-climber` and `bw-boat-hold` suspended in mid-air. |
| 6c | "invalid output falls back deterministically; caching structurally proven" | **Confirmed.** Disabling the deterministic fallback in all three jobs fails 6 tests (including adversarial-retrospective and exercise-smuggling cases); neutering the engine validators fails ~20 more. Intake's schema is `.strict()` with **no** exercise/set/rep/band field, so invariant 2 is enforced structurally, not merely checked. Independently re-verified the cache-prefix stability claim with a fresh test. No key material anywhere in the repo. Model ids checked against the `claude-api` skill — `claude-opus-5`/`claude-haiku-4-5` are correct and undated, contrary to the orchestrator's initial suspicion. |
| 6d | "LWW, local_date pinning, HealthKit denial, offline path all tested" | **Confirmed — all four survived mutation.** Forcing remote-always-wins and local-always-wins each fail 3 tests; pinning the geocode to the resolution date instead of `session.localDate` fails its test; making the device queue rethrow instead of absorb fails 3, including the offline-safety test. Also verified independently: no credentials committed, `packages/store` never imports the Firebase SDK, 0 bundled video ids, HealthKit denial is a silent early return, and no HealthKit-derived data appears in any sync payload. |
| 6e | "each auto-reject rule, set's re-validation, and the invariant-8 guard mutation-verified" | **Confirmed, every claim.** Removing each of the five §11.5 auto-reject rules independently fails 4/3/3/2/3 tests respectively; removing `set`'s re-validation fails 9; removing the bundled-video-id refusal in `load_library` fails 1. 36/36 Python tests pass with no network and no key. Stronger than claimed: `video_db.py` has **no write path at all** (no `open(…,'w')`, no `json.dump`), so invariant 8 is structurally impossible to violate from this tool, not merely guarded. Agent also self-reported a real two-counter reconciliation gap rather than declaring #30 cleanly closed. |
| 6a r4 | "136 of 148 fixed, 12 justified exemptions" | **Confirmed.** Independent sweep: 0 off-canvas, 0 penetration, exactly 12 floating — matching the documented `ELEVATED_ALLOWLIST` entry for entry. New bidirectional test re-verified as failing on pre-fix art. Agent also self-reported a bent-elbow midpoint passing through the floor that a joint-only test would have missed, and declined to force the remaining 12 to zero. Accepted. |

**Standing lesson:** a test authored by the agent that wrote the code tends to encode the same
assumptions as the code. Verify claims by re-testing them in a different environment (real file,
real bundler, real device) rather than by reading the report.
