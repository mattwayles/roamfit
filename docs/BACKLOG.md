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

- **Calendar Rewrite - spec out**
  - I’m in Transit adds an airplane icon
  - Calendar shows which focus area was worked out; F (full) U (upper) A (abs) L (legs)
  - Allow the ability to mark an untrack workout as 'workout completed' for a day - no additional info needed.

- **Ladder rungs with no sibling exercises**, so they repeat every session at that level: `horizontal_push` l7–l9, `horizontal_pull` l4–l8, `anti_extension` l4 and l6. All are high rungs nobody currently occupies — fill them when someone gets there.
- **A band exercise at a bodyweight-anchored rung has a frozen band.** Progression state is tracked
against the level's *anchor* (`currentExercise` in `progression/rules.ts` resolves
`anchor_exercise_id`), so when the anchor is bodyweight, `microAdvance` runs the bodyweight ladder
(reps → tempo → rest → sets) and never touches the band. `micro.band` stays `null`,
`clampBandToExercise` pins the prescription at the sibling's lightest band, and
`reconcileMicroToObservedBand` discards a heavier band the user logged — so the top of the
authored range is unreachable. 14 band exercises sit at such a rung; 9 lose a real band step,
including `standing-chest-press` and `floor-press` (B2-B3, frozen at B2), `single-arm-chest-press`,
`squat-jump`, `glute-bridge` (B2-B3, frozen at B2), and `chest-fly`, `close-grip-push-up`,
`banded-lat-pull-hold`, `overhead-march` (B1-B2, frozen at B1). The other 5 are single-band
records, so they lose nothing. Fix is to run the micro ladder against the exercise actually
programmed rather than the rung's anchor — but that makes micro-state shape depend on which
sibling got drawn, which is exactly what anchoring avoids, so it needs a design pass first.

---

## Problems with Individual Exercises

*Use this section to backlog changes to individual exercise details*

- **Do scapular push-ups warrant a** `shoulder_overhead` **tag?** The library carried the same movement twice with different tagging — the purpose-built warm-up record had only `wrist_extension`, `bw-scap-push-up` also has `shoulder_overhead`. Merging the duplicates (track 13) kept the stricter one, deliberately: loosening a §13.2 safety tag is not a refactor's call. If it is over-cautious, dropping it gives a shoulder-limited user one more upper warm-up.

---

## Requested Exercises

*List exercises that you'd like to incldue in the library here. Any exercise you want to remove should be disabled through the Exercise Details page*

---

## Future Features

- **Passport Feature** - What do we want to use it for? What should it look like? What's its primary purpose?
- **User Accounts** - **Anonymous Firebase Auth session isn't persisted.** No RN AsyncStorage backing, so cross-device continuity silently doesn't work. Zero impact on the core loop — nothing reads it on the critical path.
- **A native iOS wheel picker** (`@react-native-picker/picker`) instead of the hand-rolled drop-down. Costs two native dependencies and an Expo dev-client rebuild; the component interface wouldn't change, so it's a clean swap if wanted.
- **Get a second opinion on** `contraindications[]` **tagging**, especially `core_pressure` and `lower_back_extension` across the hinge, plank and hollow-hold families. This is the pregnancy hard filter — the highest-stakes judgment call in the content set, and it was made by one pass with no review.
- **Band tensions have no editor.** `DEFAULT_BAND_TENSIONS` ships sensible colours and labels and the data model is user-editable, but Settings has no UI to change them. Band brands genuinely differ.
- **LLM integration is not fully written:** `functions/` is written; no `LlmProxyCaller` implementation calls
the deployed function, nothing triggers `processLlmQueue`, and there is no natural-language intake
UI. `docs/RUNBOOK-functions-deploy.md` has never been run against a real Firebase project.
  - Using AI in workout generation based on previous retrospective input **(hold on this until we see how current progression is working)**
- **HealthKit write has no opt-in UI.** The plumbing exists (`requestHealthKitWritePermission` +
`healthWriteEnabled`); Settings has no toggle. Passport already has the equivalent control.
- **Sync trigger is weak.** `runOpportunisticSync` fires only when the Home screen regains focus. A
real connectivity-restored or app-foreground trigger would be better.
- `progression_state` **/** `users` **/** `limitations` **don't sync.** Cut for scope. Would reuse the exact  
`resolveLastWriteWins` / `syncRows.ts` pattern already in place.
- **Spotify controls are built but not switched on yet** — they need a Spotify client ID from your
own developer dashboard and a dev-client rebuild, which is the one part nobody but you can do.
Five minutes, all of it in `docs/SPOTIFY-SETUP.md`. Until then the bar renders nothing and the app
is exactly as it was. The device run is genuinely unproven: nothing under Jest can exercise a real
auth bounce, a real IPC connection, or a real track skip.
- **Spotify: no token swap server, so you reconnect once per app launch.** The controls use iOS's
implicit flow, which needs no backend and returns an access token good for about an hour — longer
than a workout, which is the window that matters. The code+swap flow would persist a session across
launches but needs an endpoint holding the client secret, and `functions/` has never been deployed
against a real project (see above), so the music controls were deliberately not made to depend on
it. Revisit if reconnecting turns out to be annoying in practice.
- **Spotify: no Settings toggle and no per-workout hide.** The bar renders nothing when the native
module is absent, so a non-Spotify build is unaffected — but a Spotify user who wants a silent
session has no way to hide it short of not connecting. Add a toggle if the row proves to be
clutter; it would follow `cueSoundsEnabled`'s pattern exactly (one column, migration 0014 is the
precedent).

