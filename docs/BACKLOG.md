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

- **Golden Hour Workout screen is Jest-verified only.** Run `npm run ios` (dev-client rebuild for
  `react-native-svg`) and walk a session: top-bar clock width, hero vs the fold on a 6.1" phone,
  timed ring with the flanking -/+ at its lower corners, rest ring pulse, paused dim, toast position.
  Details and deliberate deviations from DESIGN.md §5.7 are in `docs/handoff/STATUS-21-ui-redesign.md`.
- **Golden Hour Today + Journey are Jest-verified only** (same `npm run ios` dev-client rebuild owed
  as the Workout item above). Check on a device: hero card height and the two-up tiles on a 6.1"
  phone, the "This week" strip's 40pt cells across 7 columns, Trails cards with 9-node rung tracks,
  the Logbook cell size (7 flex columns), day-marker and Adjust flows, Stamp grid wrapping with tilt,
  the disclaimer gate with the tab bar hidden. Deviations from DESIGN.md §5.1/§5.2 are in
  `docs/handoff/STATUS-21-ui-redesign.md`.
- **Golden Hour Generate + Plan are Jest-verified only** (same `npm run ios` dev-client rebuild owed as
  the items above). Check on a device: the focus tile grid and full-width Cardio tile on a 6.1" phone,
  the Time row's horizontal scroll off the gutter, the boarding-pass perforation notches (clipped
  bg-colored discs), the rail + node alignment against 1-, 2- and 3-line exercise names, drag-to-reorder
  with the new cards (the dragged card should glow and paint over the next section), the band dropdown
  overlapping the next card, the add-exercise `Sheet` list height, and the number-pad "Done" bar.
  Deviations from DESIGN.md §5.5/§5.6 are in `docs/handoff/STATUS-21-ui-redesign.md`.
- **Golden Hour Debrief + Completion are Jest-verified only** (same `npm run ios` dev-client rebuild
  owed as the items above). Check on a device: Debrief rows with 30pt squares across 5-6 sets and long
  exercise names (the squares wrap at 62% of the row), the 8pt feedback dots' tap targets, the dashed
  `lineStrong` outline legibility, the Trail notes field with the keyboard up (scroll insets + Done bar),
  and — the important one — the Completion page: headline + stat chips + first highlight above the fold on
  a 6.1" phone, the glow orbs' warmth against `bg`, the gold sunburst, the stamped highlight card, and the
  breathing glow behind "Heck yes!". Deviations from DESIGN.md §5.8/§5.9 are in
  `docs/handoff/STATUS-21-ui-redesign.md`.
- **Golden Hour Field Guide + Exercise detail + Settings are Jest-verified only** (same `npm run ios` dev-client
  rebuild owed as the items above). Check on a device: the Field Guide's header scrolling away under a 247-row
  list, the quick chip row's horizontal scroll bleeding off the gutter, the Filters `Sheet` height with every group
  open (and its "Show N moves" button), row heights with long names + three right-hand chips, the detail hero
  (status bar over the gradient, bounce overscroll revealing `bg` above it, long names fitting `adjustsFontSizeToFit`,
  the violet legs hero text contrast), the 2-column spec grid with wide tiles, the gradient chart bars, and Settings'
  motivation time pills with five times, the dashed Add row, the Advanced disclosure and the reset `Sheet`.
  Deviations from DESIGN.md §5.3/§5.4/§5.10 are in `docs/handoff/STATUS-21-ui-redesign.md`.
- **Show the app version in Settings' footer.** `expo-constants` is hoisted in by `expo` but not declared in
  `app/package.json`; add it (`npx expo install expo-constants`) and read `Constants.expoConfig?.version`.
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

- **Daily motivation notifications — not verified on a real device/simulator.** The pool-based
  scheduler (`app/src/lib/motivationMessages.ts` + `motivationNotifications.ts`, Settings' new
  "Daily motivation" section) is Jest-proven only — real calls with the right arguments, never a
  real iOS notification center. Same honest gap the rest of Wave 5's notification work already
  carries (see `STATUS-5-motivation.md`). Needs an `expo run:ios` pass.
- **Daily motivation's schedule window is 7 days, refreshed opportunistically (on Home
  focus/open), same limitation already noted for the sync trigger below.** Because a local
  notification can't run app code at delivery time, "skip today — already trained / marked in
  transit" is only ever evaluated when the schedule is (re)built, not when it fires. If the app
  genuinely isn't opened for more than 7 days, the tail of that window can fire on a day the user
  already trained. No background task exists in this app to correct that without a reopen; fixing
  it for real would need `expo-background-task`, a new native dependency and Expo dev-client
  rebuild, deliberately not added for this.
- **Cardio: an interval-circuit format.** Cardio sessions currently run as timed straight sets
  (work for time, short rest, next exercise — `CARDIO_INTERVAL_TABLE` in
  `prescription/difficultyTable.ts`). A true circuit — rounds of back-to-back stations on a
  work/rest timer — needs a new `SessionFormat`, circuit-aware time fit, and a Workout-screen mode.
  Deferred when the Cardio focus landed (track 14) to keep that change inside the existing loop.
- **No quad stretch in the library**, so a Cardio cool-down can't target quads. Add one (and give
  it the `cardio` focus) if cardio cool-downs feel lopsided.

- **Completion screen — the native-dependency tier.** Everything the built-in `Animated` API can do
  has landed (track 17: slammed-in headline, physics confetti cannons/pops, drifting glow-orb
  backdrop, spinning rays, level-ups folded in as stamped reveal cards with their own sound, tap
  the headline to re-burst — see `SummaryScreen.tsx`, `lib/completionTimeline.ts`). Still open, all
  needing a native dep + Expo dev-client rebuild: a true blurred gradient background and 60fps
  UI-thread confetti at higher piece counts (`react-native-reanimated`), a muscle-worked
  visualization (`react-native-svg`), hold-to-charge interactions (`react-native-gesture-handler`),
  and a rendered branded share-card image instead of text (`react-native-view-shot`, already noted
  below as a §9.10 scope cut).
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
- **Spotify: session persistence + silent resume landed, device-unverified.** User-reported:
reconnecting on every app launch, every workout, and every backgrounding (phone call, another app,
screen lock) made the feature feel broken. Fixed in `spotifySession.ts` (Keychain-persisted refresh
token) + `spotifyRemote.ts`'s `resumeSpotifySession` (tried first by `connectSpotify`, and by
`useSpotifyPlayer` on mount and app-foreground) — see that file's header for the full mechanics.
Jest-verified only (auth bounces and IPC can't run under Jest, per the existing note above): a real
device pass is owed for the actual claims — a still-fresh token reconnects with zero network after
backgrounding, an expired one refreshes silently with no interactive screen, and a fresh install
after a device restart still resumes without re-authenticating.
- **Spotify: no Settings toggle and no per-workout hide.** The bar renders nothing when the native
module is absent, so a non-Spotify build is unaffected — but a Spotify user who wants a silent
session has no way to hide it short of not connecting. Add a toggle if the row proves to be
clutter; it would follow `cueSoundsEnabled`'s pattern exactly (one column, migration 0014 is the
precedent).

