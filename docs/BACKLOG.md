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

- **Golden Hour redesign — device pass owed.** Run `npm run ios` (react-native-svg is a new native
  dep: dev-client rebuild + pod install; `app.json`'s dark style and splash `bg` also only apply after
  the rebuild). Every screen of the redesign is Jest-verified only — layout was reasoned, never seen.
  Deliberate deviations from `docs/DESIGN.md` are logged per phase in
  `docs/handoff/STATUS-21-ui-redesign.md`. Checklist, most important first:
  1. Launch: fonts load (Barlow), no white flash between screens or behind the WebView, light status
     bar, tab bar, the disclaimer gate with the tab bar hidden.
  2. **Completion** (the page the user loves): the stamped headline (hard `emberDeep` 3/4pt shadow, ember
     glow, forward lean — check the lean direction and that no long word re-wraps its copy), headline +
     stat chips + first highlight above the fold on a 6.1" phone, orb warmth on `bg`, gold sunburst,
     stamped highlight card, the glow breathing behind "Heck yes!".
  3. **Active Workout**: top-bar clock width, hero vs the fold on 6.1", the timed ring with its -/+ at
     the lower corners, rest ring pulse, paused dim, toast position, rep counter with the number pad's
     Done bar.
  4. **Generate + Plan**: focus tile grid with full-width Cardio, the Time row scrolling off the gutter,
     boarding-pass notches, rail/node alignment against 1-, 2- and 3-line names, drag-to-reorder (dragged
     card glows and paints over the next section), band dropdown over the next card, add-exercise
     `Sheet` height, Done bar.
  5. **Today + Journey**: hero and two-up tiles on 6.1", the week strip's seven 40pt cells (check a week
     that spans two months: the neighbouring month's days should carry their real markers), Trails
     cards with 9-node rung tracks, Logbook cell size, day-marker and Adjust flows, Stamp grid wrapping
     with tilt.
  6. **Debrief**: 30pt squares across 5-6 sets with long names (they wrap at 62% of the row), the 8pt
     feedback dots' tap targets, dashed `lineStrong` outline legibility, Trail notes with the keyboard up.
  7. **Field Guide, Exercise detail, Settings**: header scrolling away over 247 rows, the chip row and
     Filters `Sheet` height, row heights with long names, the detail hero (status bar over the gradient,
     overscroll, long names, violet legs hero text contrast), the 2-column spec grid, gradient chart
     bars, Settings' five motivation time pills, dashed Add row, Advanced disclosure and the reset
     `Sheet`.
  8. Everywhere: Reduce Motion, large Dynamic Type (`mega`/`hero` are capped at 1.3), VoiceOver labels on
     every icon-only control.
- **Daylight light mode — device pass owed.** Track 22 shipped Jest-verified only (render tests per
  screen under both themes; contrast asserted in `theme.test`/`themes.test`). Needs a dev-client
  rebuild first: `app.json` `userInterfaceStyle` is now `"automatic"` and only applies natively after
  one. Design: `docs/DESIGN.md` §8. Checklist:
  1. Every screen in both modes (Today, Journey, Field Guide, Exercise detail, Generate, Plan, Active
     Workout, Debrief, Completion, Settings, sheets, toasts).
  2. An outdoor full-sun glance test of Daylight — can you read the set, the clock and the Done
     button at arm's length mid-set? That is the whole point of the mode.
  3. The Workout `theme-toggle` (sun/moon, left of Home) mid-session: switches live, no lost state, the
     preference persists, Settings' Appearance reflects it.
  4. System following iOS appearance live, including the automatic switch at sunset, with the app
     foregrounded.
  5. Status bar, keyboard (`keyboardAppearance`) and native stack headers follow the theme.
  6. Completion: the stamped headline (fill `ember`, `vivid.gold` shadow, no glow) plus confetti and
     orbs on paper.
  7. Tinted chips and badges (Daylight tints are 8% alpha) — legible, and distinguishable from
     `surface`/`bg`?
  8. Cards' shadow on paper (`elevation.card`), the Switch thumb, Toast and tab bar lift.
  9. Band-chip labels on mid-tone swatches: BandChip's pre-existing 0.45 luminance threshold may pick
     the wrong legend on a few mid-tone bands; swatches are mode-invariant, so check each.
  10. Logbook and Today week-strip day cells (`dayCell`: vivid at 40%, deep border): every marker
     reads as its own color next to the others, not washed out; tune the alpha if not.
- **WorkoutScreen tests flake under a full `npm run check` (~1 run in 10).** A different
  `WorkoutScreen.*.test.tsx` fails each time (seen: `anchor`, `rest`, `keyboard`), always a
  `waitFor` timing out on the first screen element while the suite takes 8-10s, followed by "A
  worker process has failed to exit gracefully". Same rate with and without the fitted-text change
  (1/9 vs 1/10), so it predates it. Likely the suites' `WAIT_OPTS` timeout is too tight for the
  first Workout render under parallel load, or a leaked timer; try `--detectOpenHandles` first.
- **Fitted text — device check owed.** `Txt` now fits `adjustsFontSizeToFit` text in JS
  (`theme/fitText.ts`, widths generated by `tools/font_metrics.py`) because iOS's native shrink on
  the New Architecture ignores `minimumFontScale` and fell to ~4pt (Journey "Miles so far" tiles).
  Jest-verified only. On a device: the Journey tiles with a 4-digit Minutes value, the Workout
  clock and both ring numerals, the Completion counters, a long exercise name on Exercise detail and
  in the Workout header, Debrief set squares, passport stamps, the Today hero title (2 lines) and the
  Plan focus. Watch for a one-frame flash of ellipsized text before the first fit (a clipped text
  is drawn at full size until its first layout reports the room). Re-run the generator if the fonts
  are upgraded: `python3 tools/font_metrics.py --check` exits 1 when stale.
- **App icon and splash art to match Golden Hour — needs an artist.** The splash background is `bg` and
  stays Golden Hour in both appearances (one static image; Daylight does not get its own splash),
  but `app/assets/icon.png` and `splash-icon.png` were not redrawn for the
  redesign (the redesign spec put the art out of scope). Design brief: night-sky `bg`, ember-to-gold sunrise, one travel motif (topographic
  contours or a stamp), Barlow Condensed wordmark.
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

- **Completion screen — the remaining native-dependency tier.** Everything the built-in `Animated` API
  can do has landed (track 17: slammed-in headline, physics confetti cannons/pops, drifting glow-orb
  backdrop, spinning rays, level-ups folded in as stamped reveal cards with their own sound, tap the
  headline to re-burst — see `SummaryScreen.tsx`, `lib/completionTimeline.ts`), and `react-native-svg` is
  now installed (Golden Hour redesign). Still open: a true blurred/radial gradient backdrop
  (`CelebrationBackdrop` still fakes the glow orbs with stacked translucent rings; an SVG
  `RadialGradient` is now possible without a new dep), a muscle-worked visualization (SVG is available;
  nothing built), and — each needing a new native dep and another dev-client rebuild — 60fps UI-thread
  confetti at higher piece counts (`react-native-reanimated`), hold-to-charge interactions
  (`react-native-gesture-handler`), and a rendered branded share-card image instead of text
  (`react-native-view-shot`, already noted below as a §9.10 scope cut).
- **Passport — the open questions.** It is a stamp collection now (a seeded `Stamp` per city on
  Journey, opt-in in Settings), so "what is it for" is answered. Still undecided: (1) countries and
  milestones (level-ups, best sets) do not get stamps yet, only cities; (2) the Share button sends a
  plain-text line — a rendered stamp-sheet image is the natural share, but needs `react-native-view-shot`
  (see the Completion item above).
- **User Accounts** - **Anonymous Firebase Auth session isn't persisted.** No RN AsyncStorage backing, so cross-device continuity silently doesn't work. Zero impact on the core loop — nothing reads it on the critical path.
- **Get a second opinion on** `contraindications[]` **tagging**, especially `core_pressure` and `lower_back_extension` across the hinge, plank and hollow-hold families. This is the pregnancy hard filter — the highest-stakes judgment call in the content set, and it was made by one pass with no review.
- **Band tensions have no editor.** `DEFAULT_BAND_TENSIONS` ships sensible colours and labels and the data model is user-editable, but Settings has no UI to change them. Band brands genuinely differ.
- **LLM integration is not fully written:** `functions/` is written; no `LlmProxyCaller` implementation calls
the deployed function, nothing triggers `processLlmQueue`, and there is no natural-language intake
UI. `docs/RUNBOOK-functions-deploy.md` has never been run against a real Firebase project.
  - Using AI in workout generation based on previous retrospective input **(hold on this until we see how current progression is working)**
- **HealthKit write is never authorized.** Settings has the "Write workouts" toggle (it persists
  `healthWriteEnabled`), but nothing calls `requestHealthKitWritePermission()`, and
  `healthKitWriter.writeWorkout` no-ops until that in-memory flag is set, so no workout is ever
  written. Call it from `toggleHealthWrite` when turned on (and re-request on launch when already on:
  `authorizationRequested` resets each app start). Found in the Phase G sweep; left alone because the
  redesign froze behavior.
- **Sync trigger is weak.** `runOpportunisticSync` fires only when the Home screen regains focus. A
real connectivity-restored or app-foreground trigger would be better.
- `progression_state` **/** `users` **/** `limitations` **/** `spotify_playlists` **(and `users.spotify_vibes`) don't sync.** Cut for scope. Would reuse the exact  
`resolveLastWriteWins` / `syncRows.ts` pattern already in place.
- **Spotify: no Settings toggle and no per-workout hide.** The bar renders nothing when the native
module is absent, so a non-Spotify build is unaffected — but a Spotify user who wants a silent
session has no way to hide it short of not connecting. Add a toggle if the row proves to be
clutter; it would follow `cueSoundsEnabled`'s pattern exactly (one column, migration 0014 is the
precedent).

