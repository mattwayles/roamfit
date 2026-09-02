# RoamFit — Backlog

The single list of everything not yet done: features, bugs, technical debt, and verification owed.

**This file is the tracker.** Requests that aren't built immediately get parked here. There is no
separate roadmap, wave plan, or ADR set any more — those were the scaffolding for building the app
from a spec, and the app is now driven directly by user feedback. If a change is requested, it is
the right thing to do; it does not need to be justified against a prior document.

Ordering within a section is rough priority, highest first. Delete items when done — git history is
the record of what was completed and why.

---

## Desired Fixes

- **Ladder rungs with no sibling exercises**, so they repeat every session at that level: `horizontal_push` l7–l9, `horizontal_pull` l4–l8, `anti_extension` l4 and l6. All are high rungs nobody currently occupies — fill them when someone gets there.
- **Two rungs are still anchored on an exercise the hard filters remove**, while a sibling covers the rung — so progression runs against a movement the user is never shown, and the dashboard names the rung after it: `horizontal_push.l2` (anchor `bw-incline-push-up`, needs `body-support`; covered by `floor-press`) and `vertical_pull.l1` (anchor `bw-dead-hang`, needs `pullup-bar`; covered by `bw-low-bar-hang` / `banded-lat-pull-hold`). Same defect as `vertical_push.l4`, fixed the same way: re-point the anchor at the sibling and keep the gated exercise as a sibling. Both are named in the tripwire in `packages/engine/src/progression/ladder.test.ts` — fix them by deleting them from that list, never by adding to it. Rungs where *no* sibling is default-available (`horizontal_push.l7`, `vertical_pull.l6`–`l9`, `hinge.l7`, `lunge.l5`, `lunge.l6`) are gear-gated end to end and are NOT this bug.
- Mark an untracked workout
- Passport enabled by default
- I’m in Transit doesn’t seem to do anything
- Using AI in workout generation based on previous retrospective input

---

## Future Features

- User Accounts - **Anonymous Firebase Auth session isn't persisted.** No RN AsyncStorage backing, so cross-device continuity silently doesn't work. Zero impact on the core loop — nothing reads it on the critical path.
- **A native iOS wheel picker** (`@react-native-picker/picker`) instead of the hand-rolled drop-down. Costs two native dependencies and an Expo dev-client rebuild; the component interface wouldn't change, so it's a clean swap if wanted.
- Backgrounding and force-quite are unproven on a real device;`wallClockTimer.test.ts` proves the timer maths is suspension-proof against an injected fake clock. That is not the same as backgrounding a real phone with a rest timer running, waiting, and foregrounding it. Same for force-quit mid-set and `findCurrent()` resume.
- **Get a second opinion on** `contraindications[]` **tagging**, especially `core_pressure` and `lower_back_extension` across the hinge, plank and hollow-hold families. This is the pregnancy hard filter — the highest-stakes judgment call in the content set, and it was made by one pass with no review.
- **Band tensions have no editor.** `DEFAULT_BAND_TENSIONS` ships sensible colours and labels and the data model is user-editable, but Settings has no UI to change them. Band brands genuinely differ.

---



## 🔌 Unfinished integrations

- **The LLM proxy has never run.** `functions/` is written; no `LlmProxyCaller` implementation calls
the deployed function, nothing triggers `processLlmQueue`, and there is no natural-language intake
UI. `docs/RUNBOOK-functions-deploy.md` has never been run against a real Firebase project.
- **HealthKit write has no opt-in UI.** The plumbing exists (`requestHealthKitWritePermission` +
`healthWriteEnabled`); Settings has no toggle. Passport already has the equivalent control.
- **Sync trigger is weak.** `runOpportunisticSync` fires only when the Home screen regains focus. A
real connectivity-restored or app-foreground trigger would be better.
- `progression_state` **/** `users` **/** `limitations` **don't sync.** Cut for scope. Would reuse the exact  
`resolveLastWriteWins` / `syncRows.ts` pattern already in place.

