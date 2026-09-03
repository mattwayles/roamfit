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

- I’m in Transit doesn't do anything
  - But I want to refactor the calendar component anyway; let's spec that out.
  - Allow the ability to mark an untrack workout as 'workout completed' for a day - no additional info needed.
- Using AI in workout generation based on previous retrospective input
- **Ladder rungs with no sibling exercises**, so they repeat every session at that level: `horizontal_push` l7–l9, `horizontal_pull` l4–l8, `anti_extension` l4 and l6. All are high rungs nobody currently occupies — fill them when someone gets there.

---

## Problems with Individual Exercises

*Use this section to backlog changes to individual exercise details*

---

## Requested Exercises

*List exercises that you'd like to incldue in the library here. Any exercise you want to remove should be disabled through the Exercise Details page*

---

## Future Features

- **Passport Feature** - What do we want to use it for? What should it look like? What's its primary purpose?
- **User Accounts** - **Anonymous Firebase Auth session isn't persisted.** No RN AsyncStorage backing, so cross-device continuity silently doesn't work. Zero impact on the core loop — nothing reads it on the critical path.
- **A native iOS wheel picker** (`@react-native-picker/picker`) instead of the hand-rolled drop-down. Costs two native dependencies and an Expo dev-client rebuild; the component interface wouldn't change, so it's a clean swap if wanted.
- Backgrounding and force-quite are unproven on a real device;`wallClockTimer.test.ts` proves the timer maths is suspension-proof against an injected fake clock. That is not the same as backgrounding a real phone with a rest timer running, waiting, and foregrounding it. Same for force-quit mid-set and `findCurrent()` resume.
- **Do scapular push-ups warrant a** `shoulder_overhead` **tag?** The library carried the same movement twice with different tagging — the purpose-built warm-up record had only `wrist_extension`, `bw-scap-push-up` also has `shoulder_overhead`. Merging the duplicates (track 13) kept the stricter one, deliberately: loosening a §13.2 safety tag is not a refactor's call. If it is over-cautious, dropping it gives a shoulder-limited user one more upper warm-up.
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

