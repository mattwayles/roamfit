# RoamFit — Backlog

The single list of everything not yet done: features, bugs, technical debt, and verification owed.

**This file is the tracker.** Requests that aren't built immediately get parked here. There is no
separate roadmap, wave plan, or ADR set any more — those were the scaffolding for building the app
from a spec, and the app is now driven directly by user feedback. If a change is requested, it is
the right thing to do; it does not need to be justified against a prior document.

Ordering within a section is rough priority, highest first. Delete items when done — git history is
the record of what was completed and why.

---

## 🔴 Blocking a real release

### Device verification has never happened
Effectively everything since the Wave 4 UI work is verified by ~1,285 automated tests and scripted
probes only. Nothing in the last several sessions has been seen running on a phone. The airplane-mode
acceptance gate — install clean, no connectivity from before first launch, five workouts across three
days, everything functional — has never been run and needs a human.

### Migration 0009 is destructive and untested against real data
`0009_reset_progression_to_level_1.sql` deletes every `progression_state` row on first launch after
this ships, so levels re-seed at 1. Every store test starts from a fresh database, so the actual
upgrade path has never run. Verify on device that progression re-seeds, and that `exercise_state`
(enjoyment EMAs, best sets, skip counts, assigned videos) survives untouched.

### Backgrounding and force-quit are unproven on a real device
`wallClockTimer.test.ts` proves the timer maths is suspension-proof against an injected fake clock.
That is not the same as backgrounding a real phone with a rest timer running, waiting, and
foregrounding it. Same for force-quit mid-set and `findCurrent()` resume.

---

## 🐛 Bugs and known-wrong behaviour

- **`upper` at 60 minutes lands 12% short** (~53 min) and reports `template_exhausted`. Pre-existing,
  verified against the unmodified engine. `UPPER_ISOLATION` has only three accessory patterns, so the
  upper template runs out of slots before the budget fills. Fix is more upper accessory patterns, or
  a volume multiplier like the one long sessions use.
- **Anonymous Firebase Auth session isn't persisted.** No RN AsyncStorage backing, so cross-device
  continuity silently doesn't work. Zero impact on the core loop — nothing reads it on the critical
  path.
- **Glyph rendering is unverified on device.** `❚❚` `■` `⇄` `▸▸` `✕` `⠿` are all plain-text glyphs
  chosen to avoid iOS emoji substitution, but that has only been reasoned about, never seen.
- **Card height vs. long exercise names.** `CARD_HEIGHT` (approval card) is a fixed 132pt sized for a
  two-line name; the drag-to-reorder gesture divides by it. A three-line name would overflow. Same
  class of risk: `OptionPicker`'s fixed 96pt item width.

---

## 🧭 Product decisions deliberately left open

- **Abandoning a workout doesn't blocklist its exercises.** `sessionsAgo` ignores discarded sessions,
  so an abandoned workout's exercises stay eligible next time. Making it count would add variety but
  turns abandonment into a two-session ban — a punishment mechanic. Revisit only with evidence.
- **Level-up lives only on the progression board.** Considered and rejected: surfacing it inside the
  swap flow. If the level-1 cold start feels punishing on device, that's the cheap fix — it needs no
  new store or engine work.
- **Feed `level_up_too_easy` signals back into the cold start.** The signal carries both rungs
  specifically so a future pass can tune the starting level from real data instead of a guess.
- **The swap sheet's "different anchor point" filter is gone**, removed with the sheet when swap
  became one-tap. If it's wanted back it needs a home — a long-press, or a setting.
- **A native iOS wheel picker** (`@react-native-picker/picker`) instead of the hand-rolled drop-down.
  Costs two native dependencies and an Expo dev-client rebuild; the component interface wouldn't
  change, so it's a clean swap if wanted.
- **Drag-to-reorder is hand-rolled** on raw responder props rather than
  `react-native-reanimated` + `react-native-gesture-handler`, for the same rebuild reason. Works, but
  a library would handle edge cases (autoscroll near the screen edge, cross-section drags) that this
  doesn't.

---

## 📚 Content and library gaps

- **Ladder rungs with no sibling exercises**, so they repeat every session at that level:
  `horizontal_push` l7–l9, `horizontal_pull` l4–l8, `anti_extension` l4 and l6. All are high rungs
  nobody currently occupies — fill them when someone gets there.
- **`vertical_push.l4` (`bw-dip`) needs `body-support`**, which is not default-available, so it is
  hard-filtered away for most users. `banded-push-press` covers the rung, but the anchor choice is
  worth revisiting.
- **`tke` now carries no contraindications at all**, and `hamstring-curl` carries only
  `knee_flexion_loaded`. Both previously said `hip`, inherited from the wrong pattern — neither
  loads the hip. The new tags are defensible but were set by one non-clinical pass; they belong in
  the review below.
- **Get a second opinion on `contraindications[]` tagging**, especially `core_pressure` and
  `lower_back_extension` across the hinge, plank and hollow-hold families. This is the pregnancy hard
  filter — the highest-stakes judgment call in the content set, and it was made by one pass with no
  review.
- **Band tensions have no editor.** `DEFAULT_BAND_TENSIONS` ships sensible colours and labels and the
  data model is user-editable, but Settings has no UI to change them. Band brands genuinely differ.

---

## 🔌 Unfinished integrations

- **The LLM proxy has never run.** `functions/` is written; no `LlmProxyCaller` implementation calls
  the deployed function, nothing triggers `processLlmQueue`, and there is no natural-language intake
  UI. `docs/RUNBOOK-functions-deploy.md` has never been run against a real Firebase project.
- **HealthKit write has no opt-in UI.** The plumbing exists (`requestHealthKitWritePermission` +
  `healthWriteEnabled`); Settings has no toggle. Passport already has the equivalent control.
- **Sync trigger is weak.** `runOpportunisticSync` fires only when the Home screen regains focus. A
  real connectivity-restored or app-foreground trigger would be better.
- **`progression_state` / `users` / `limitations` don't sync.** Cut for scope. Would reuse the exact
  `resolveLastWriteWins` / `syncRows.ts` pattern already in place.

---

## 🧹 Technical debt

- **App tests share one module-level `getDb()` singleton**, so tests inherit each other's writes.
  `GenerateScreen.test.tsx` and `HomeScreen.levelUp.test.tsx` work around it by resetting state in
  their setup. A per-test database would remove a whole class of confusing timeouts.
- **RNTL renders commit asynchronously under React 19.** A synchronous assertion straight after
  `render()` fails with "`render` function has not been called", which looks like a broken component
  and isn't. Documented in `BandChip.test.tsx`; worth a shared test helper.
- **Recovery Week is a post-pass in `generation.ts`**, not a real `GenerationRequest` field. Small,
  low-risk, clearly-scoped engine change if a cleaner shape is wanted.
- **Recovery treatment is per-entry, not session-wide.** If sessions start feeling over-lightened
  (three exercises all dropping a band on the same day), this is the first place to look. The fix
  needs a counter shared between `resolveLadderSlot` and `selectMain`, which the architecture
  currently doesn't pass around.
- **`mastery_pr_check` and explicit Recovery Week aren't surfaced** through `generateSession`. Both
  are evaluated from real performance, which only exists at completion. The engine supports the
  wire-up; nothing calls it.
- **744 `§N` and 138 `ADR 00NN` references in code comments are now unresolvable**, since spec.md and
  the ADRs were deleted. The prose around them still carries the reasoning. Strip them only if they
  start actively misleading — a 153-file comment rewrite is its own risk.
