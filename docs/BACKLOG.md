# Wanderlift — Backlog

The single list of everything not yet done: features, bugs, technical debt, and verification owed.

**This file is the tracker.** Requests that aren't built immediately get parked here. There is no
separate roadmap, wave plan, or ADR set any more — those were the scaffolding for building the app
from a spec, and the app is now driven directly by user feedback. If a change is requested, it is
the right thing to do; it does not need to be justified against a prior document.

Ordering within a section is rough priority, highest first. Delete items when done — git history is
the record of what was completed and why.

---

## Desired Fixes

- **Restored user with no completed session** keeps the old phone's motivation notifications until
  Today next schedules (rare; untested).
- **Demo-video leftovers are now dead weight.** The Demo card, the paste-a-link flow and the
  video-flag demotion are gone (How to now has a "Watch a demo" button opening a YouTube search for
  "<name> Exercise"; `lib/youtubeSearch.ts`). Left in place, unread: `exercise_state.user_video_id`,
  `user_video_assigned_at`, `video_flag_count`, `video_demoted_at`, `session_entries.demo_media_expanded`,
  the `video_flag_reported` / `user_video_assigned` / `demo_media_expanded` signal types, and the
  `react-native-webview` dependency (still used only by its jest mock). Drop them with a migration,
  and remove the dependency, in one pass.
- **`lifetime_total_minutes` is now write-only.** The Journey tile moved from minutes to sets
  (`lifetimeSets` in `stats.ts`, derived from `set_logs`), so nothing reads the column
  (`rolled_up_stats`, migration 0003) or `lifetimeTotalMinutes` any more. Drop both with a
  migration, or leave if a minutes stat returns.
- **`travel_days_this_week` is now write-only.** It reduced the weekly-target denominator, which went
  with days per week (Track 40). `recordTravelDay` still bumps it; the calendar reads the
  `travel_day` signal event instead. Drop the column and the bump with a migration.
- **Today / Journey / Field guide headers (Track 41) — device pass owed.** The Today header is the
  logo alone, centred (now 72pt) with the gear on the right: glow not clipped, size right in
  Midnight and Daybreak, gear never overlaps the logo on a small phone. The Journey / Field guide
  gears line up with their titles without crowding the Field guide move count on a small phone.
- **Passport book — device pass owed, and two loose ends.** Track 39
  (`docs/handoff/STATUS-39-passport.md`, Jest-verified only; the full device-check list is there).
  On a device, in Midnight and Daybreak: the cover emboss and guilloché page lines, the 460pt page on
  a 6.1" phone, the 3D turn about the spine (400ms, `transformOrigin`, clipping by the book's
  `overflow: hidden`, shadow strength), swipe threshold and rubber band, the haptic tick, Reduce
  Motion and VoiceOver (instant swap; swipe up/down on "Page N of M"), the Journey teaser's three
  80pt stamps on a small phone, and Completion's "See it in your passport ›" link opening the right
  page. Not built: (1) a `stampLabel` param change arriving mid-turn isn't guarded, so the turn's end
  commit can override the jump; (2) the Journey teaser could show each stamp's first-visit date.
- **WorkoutScreen tests flake under a full `npm run check` (~1 run in 10).** A different
  `WorkoutScreen.*.test.tsx` fails each time (seen: `anchor`, `rest`, `keyboard`), always a
  `waitFor` timing out on the first screen element while the suite takes 8-10s, followed by "A
  worker process has failed to exit gracefully". Same rate with and without the fitted-text change
  (1/9 vs 1/10), so it predates it. Likely the suites' `WAIT_OPTS` timeout is too tight for the
  first Workout render under parallel load, or a leaked timer; try `--detectOpenHandles` first.
- **Rungs with a single exercise.** Track 37k gave siblings to the high rungs the old backlog item
  named (horizontal_push l7, horizontal_pull l4-l8, anti_extension l4/l6), but 23 rungs still hold
  one exercise, so at that level the current-rung draw (~60%) always repeats it: horizontal_push
  l3b, l8, l8b, l9; horizontal_pull l2; vertical_push l6, l6b, l7; vertical_pull l5-l9 and l6b;
  squat l0, l1, l4, l5, l7; hinge l7; lunge l0, l1, l7. Lower-rung recall softens it. Add siblings
  as people reach them; keep the 37c tagging standard and the text guards green.
- **Show the app version in Settings' footer.** `expo-constants` is hoisted in by `expo` but not declared in
  `app/package.json`; add it (`npx expo install expo-constants`) and read `Constants.expoConfig?.version`.

---

## Problems with Individual Exercises

_Use this section to backlog changes to individual exercise details_

- Rep-basis cue (per side / total, both sides) on the workout counter, approval card and exercise page: device pass owed. The `alternating` list in `exercises.json` is an editorial call; add the flag to any move that should read "total, both sides".

---

## Requested Exercises

_List exercises that you'd like to incldue in the library here. Any exercise you want to remove should be disabled through the Exercise Details page_

---

## Future Features

- **Share a badge as an image.** The badge sheet shares text only (`badgeShareText` via
  `Share.share`). A card image (emblem, name, date) needs `react-native-view-shot` to capture a
  styled view, which is a new native module and so a dev-client rebuild; note it in the status file
  when added.
- **Settings toggle to hide badges.** Badges have no off switch in v1 (Passport badges follow the
  Passport opt-in). If someone wants a quieter app, a Settings toggle that hides the Journey card,
  Today's Next badge row and the completion-screen cards would do it; awarding can keep running
  silently so nothing is lost.
- **`buildBadgeFacts` is uncached.** It runs a full-history read on every dashboard load (Today,
  Journey and Badges). Measure it on a device with a long history before optimizing; if it shows,
  cache the facts and invalidate on session completion.
- **Find a workout by focus ("when was my last leg day?").** Track 27 lets you page the Logbook back
  month by month and open any day, but there is no filter or search list. Deliberately not built:
  a focus filter over `getCompletedSessionsInRange` (or a flat "recent workouts" list grouped by
  focus) would answer it directly.
- **Weekly-volume charts / a Progress hub.** Track 27 puts graphs only on Exercise detail and Trail
  progress pages (per-exercise and per-movement-group best set). Weekly volume, sets per muscle group
  or a top-level Progress tab were deliberately left out; `ProgressChart` and `chartGeometry` are
  the pieces to build on.
- **Daily motivation's schedule window is 7 days, refreshed opportunistically (on Home
  focus/open), same limitation as any opportunistic refresh.** Because a local
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
- **Weighted set volume — device pass owed, and the rest of the engine still counts planned sets.**
  Track 36 (`docs/handoff/STATUS-36-weighted-focus-volume.md`, Jest-verified only). The Recommended
  Focus now weights each completed set by logged reps (holds: per-side seconds) and band against the
  exercise's own range; skipped sets count nothing. On a device: after a short leg session and a
  long upper one, check Generate recommends legs. Not changed, deliberately: `trailingVolume` —
  OVER-WORKED / UNTRAINED / LOW (thresholds calibrated in planned sets, LOW < 3) and the generation
  lean (`lightestMuscles`), which still count planned sets including skipped ones. Moving them to the
  same weighting needs those thresholds re-tuned. Cardio counts completed sets unweighted (no reps or
  band to weigh); an interval's seconds could weight it if cardio vs strength feels off.
- **No quad stretch in the library**, so a Cardio cool-down can't target quads. Add one (and give
  it the `cardio` focus) if cardio cool-downs feel lopsided.

- **Completion screen — the remaining native-dependency tier.** Everything the built-in `Animated` API
  can do has landed (track 17: slammed-in headline, physics confetti cannons/pops, drifting glow-orb
  backdrop, spinning rays, level-ups folded in as stamped reveal cards with their own sound, tap the
  headline to re-burst — see `SummaryScreen.tsx`, `lib/completionTimeline.ts`), and `react-native-svg` is
  now installed (Midnight redesign). Still open: a true blurred/radial gradient backdrop
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
- **"This hurts" from the active workout — not yet (user decision, 2026-10-18).** Deferred from Track 37. The store already has `limitations.source = 'pain_report'` with an expiry and
  `ExerciseState.suppressedUntil`; a button mid-set would add a dated limitation and suppress the
  exercise, then offer a swap.
- **Push / Pull foci — deferred by user decision (2026-10-18).** Built as Track 37j (9db32c0) and
  reverted (bf13210): "I do not want separate push/pull focus areas at this time." The reverted
  commit is a working reference (split templates, `suitsFocus`, `TemplateSlot.primaryAny`).
- **Human review of `contraindications[]` — owed before public release.** Track 37c
  (`docs/review/contraindications-review-2026-10.md`) re-tagged all 267 exercises in a CSCS role and
  added `lying_supine` / `lying_prone`, but it is an AI pass, not the review. A physical therapist (or
  a CSCS working with one) should sign it off, starting with the pregnancy/postpartum filter, and
  decide its four open questions (brief supine work, fall risk, inversions, splitting postpartum from
  pregnancy).
  Also in that review: the 23 bodyweight exercises added so every rung has a no-band option
  (`packages/data/src/noBandLadders.test.ts`) were tagged by the same AI pass, not a person. And the
  band-free path still needs fixed points on some rungs: `horizontal_pull` l3/l4/l6/l7 need a low bar,
  `vertical_pull` l4-l6 a pull-up bar, `vertical_push` l2 and `hinge` l6 a bench or step. Without
  them the resolver walks down to the nearest rung it can serve, so a user with no bands and no
  fixed points climbs squat, lunge and core fully, horizontal pull to l2, vertical pull to l3, and
  stalls at the first rung needing a fixed point on the others.

- **Settings polish — owed on device.** Rebuild the dev client for
  `@react-native-community/datetimepicker`, and check the compact time
  picker and the Mail hand-off on a phone.
