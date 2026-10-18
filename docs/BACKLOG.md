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

- **Next Unlock → Journey scroll — device pass owed.** Tapping the Next Unlock card on Today now opens
  Journey scrolled to that family's Trail card (`focusFamilyId` route param; offsets come from
  `onLayout`, tested in Jest with synthetic layouts only). On a device check the card lands just under
  the top edge with the chart's height settled (cards are taller once their charts mount), that it
  works both from a cold Journey and with Journey already open, and that Reduce Motion is fine.
- **History / past months / progress graphs — device pass owed.** Track 27
  (`docs/handoff/STATUS-27-history-progress.md`) is Jest-verified only. On a device, in Midnight
  and Daybreak: (1) `ProgressChart` (Exercise detail and the Journey Trail cards' Best set is now one single-value stat per exercise — top reps/seconds at the heaviest band, Track 32 — not a chart): the tap-to-read target is
  the whole plot, so check nearest-point taps feel right on a long history, y/date labels and the
  dashed level ticks read at phone width, the per-exercise colours separate (a colour-blind check
  was not run — `dataviz`'s validator was not run on the five accent tones), and the Best set /
  Total volume toggle; (2) the Logbook day sheet's height with 2 sessions and 9 markers (does it
  scroll or clip?); (3) the month picker's pill touch targets (12 per year row) and ‹ › paging
  speed through many months, including a multi-year jump; (4) the chart on each Trail card
  (eight 140pt charts make Trails a long scroll — check it still reads as a ladder, and that a tap on a
  chart doesn't fight the page scroll), including a family that crossed a reps/seconds rung (the line
  should break, not plot a zero); the history row "Trail ›" now just opens Journey; (5) the new
  **Progress** chart (Track 29, `docs/handoff/STATUS-29-ladder-progress.md`, Jest-verified only) on a
  real band step-up: it should read as progress (the point rises) where Best set shows reps drop
  and a new colour with a band tick; check the Progress / Best set toggle on Trail cards and the
  three-way toggle on Exercise detail (Progress hidden for warm-ups), the in-plot band labels
  ("B3") not colliding with rung labels or dots at phone width, and the "Rung 3 · B3 × 8 reps ·
  3 sets" readout; (6) the per-level pager (Track 30, `docs/handoff/STATUS-30-per-level-charts.md`):
  ‹ › hit targets beside the toggle, the "Level 2 · <long exercise name>" title truncating rather
  than wrapping, and that opening on the current level after a level-up feels right. Left out on purpose: no rung ticks on Exercise detail; Progress counts a
  band sibling at a bodyweight-anchored rung by reps/pace only (mirrors the frozen-band bug
  above); a session's tempo/rest are the prescribed values, not measured. Then the same in
  airplane mode.
- **Exercise-feedback modal — device pass owed.** Track 26: "How did those N sets of NAME feel?" is
  asked once, in a `Sheet` over the rest timer after an exercise's last set (Settings → Training →
  "Ask how each set felt", default on; off = the same question inline on that rest page). One answer
  per exercise, stored on `session_entries.difficulty_feedback`; Summary shows one tappable chip per
  exercise. Jest-verified only: check the sheet over the ring and the Summary chip layout on a device.
  The toggle's label still says "each set" — reword it ("Ask how each exercise felt") if the copy
  bothers you. Still unbuilt, if one question per exercise is too much: ask only when the load
  changed or a set missed target, or stop asking an exercise once its recent answers agree.
  `set_logs.difficulty_feedback` is legacy (unwritten, unread since migration 0026) — drop it with the
  next table rebuild.
- **New passport stamp on Completion — device pass owed.** Track 25 (`docs/handoff/STATUS-25-new-stamp.md`)
  is Jest-verified only; the feel can't be. On a device with Passport on and location allowed, finish a
  workout somewhere new: (1) the haptics read as a hand stamping the phone — lift tick, a sharp rigid hit,
  the heavy weight 45ms behind it, a soft rebound at 150ms (`cueStampImpact`, `workoutAudio.ts`); tune the
  gaps there if it feels like three taps rather than one stamp; (2) `stamp-thunk.wav` level next to
  `level-up.wav` (regenerate with `tools/make_stamp_sound.py`); (3) the descent (ease-in, 420ms), squash,
  ink ring and card dent; (4) the lookup wait — a GPS fix can take a few seconds, and "Heck yes!" is held
  up to `STAMP_LOOKUP_TIMEOUT_MS` (6s) for it; if that feels long, shorten it (a late stamp still lands
  on Journey via the queue, but not on this screen); (5) Reduce Motion; (6) both themes.
- **Spotify foreground reconnect — device check owed.** The silent resume now retries `connect()` twice (500/1500 ms) and swallows the native `CONNECTION_FAILED` event while it runs. Check on a device: Spotify connected, switch to YouTube for a while, return — should reconnect with no error. If Spotify was fully suspended/killed the silent path still can't wake it (by design); the Connect button remains the way back, but the error is gone and a banner-free "Connect" state shows instead.
- **Midnight Green recolor — device pass owed.** Track 28 (`docs/handoff/STATUS-28-midnight-green.md`)
  replaced the teal green with Midnight Green (`teal`/`tealDeep`: Midnight `#4FB8C4`/`#2E8C98`, Daybreak
  `#004C54`/`#003A40`), made the old teal `lagoon` a blue-violet `periwinkle`, then pulled it and `summit` away from `sky`
  (track 28b: `summit` is plum `#C77DFF` / `#7E2BB0`; `periwinkle` became `coral`, then track 28d made it
  `fern` `#68CF59` / `#217515`, a leaf green at hue 112.5, the exact middle of the gold-teal gap),
  and renamed the themes Midnight (dark) and Daybreak (light). Jest-verified only (contrast floors hold).
  On a device, in both themes: (1) fern is a green again — check it reads as a calm secondary, not as
  the retired pine primary; fern vs the Spotify button (`#1db954`, ~29 degrees away); the rest ring,
  cooldown rail, Full-body chip and Countries tile in fern; plum (summit) vs rose; sky vs teal
  (Travel-day vs Main rail); the six Journey Markers tiles alternate teal and fern in a checkerboard
  — check the grid scans and the two greens-and-teals read as distinct;
  the `sun` accent is gone (it duplicated gold): the
  Midnight Completion stamp headline and Today hero pill text are gold, and the confetti, orbs and
  rays lost their pale yellow — check the celebration still feels warm enough;
  (2) the `trail` hero gradient with the sepia topo ink on Home and Completion; (3) the stamp's hard
  `tealDeep` shadow; (4) the Spotify button (`#1db954`, `SpotifyControls.tsx`) next to teal controls.
- **`lifetime_total_minutes` is now write-only.** The Journey tile moved from minutes to sets
  (`lifetimeSets` in `stats.ts`, derived from `set_logs`), so nothing reads the column
  (`rolled_up_stats`, migration 0003) or `lifetimeTotalMinutes` any more. Drop both with a
  migration, or leave if a minutes stat returns.
- **Background timer sounds — device check owed.** A looping silent track (`silence-loop.wav`,
  `startBackgroundKeepAlive` in `workoutAudio.ts`) now plays for the life of the Workout screen so
  iOS keeps JS timers alive and the 3-2-1 / chime / completion cues sound locked or backgrounded.
  Jest can't verify it. Check on a device: background mid-countdown, lock the screen, with and
  without Spotify playing; confirm no Now Playing entry appears and music isn't interrupted. If iOS
  still suspends, fall back to scheduled local notifications with bundled sounds.
- **Midnight redesign — device pass owed.** Run `npm run ios` (react-native-svg is a new native
  dep: dev-client rebuild + pod install; `app.json`'s dark style and splash `bg` also only apply after
  the rebuild). Every screen of the redesign is Jest-verified only — layout was reasoned, never seen.
  Deliberate deviations from `docs/DESIGN.md` are logged per phase in
  `docs/handoff/STATUS-21-ui-redesign.md`. Checklist, most important first:
  1. Launch: fonts load (Barlow), no white flash between screens or behind the WebView, light status
     bar, tab bar, the disclaimer gate with the tab bar hidden.
  2. **Completion** (the page the user loves): the stamped headline (hard `tealDeep` 3/4pt shadow, teal
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
- **Spotify vibes / recents / favorites — device pass owed.** Track 23 is Jest-verified only. On a
  device with Spotify connected: (1) real vibe searches — do women-targeted / gendered playlists still
  dominate for Rock, Metal, Hip-Hop, etc.? If so, tune the terms in `app/src/lib/spotifyVibes.ts` (a
  small name exclusion is the fallback, deliberately not built); (2) refresh variety — does the
  Fresh picks refresh button give a visibly different list for the same vibe, without relevance
  collapsing; (3) recents and favorites persist across an app relaunch, a favorited recent moves
  to Favorites and back, and the vibe selection is remembered; (4) airplane mode: Favorites/Recents
  still render and play, with only Fresh picks showing the error.

- **Daybreak light mode — device pass owed.** Track 22 shipped Jest-verified only (render tests per
  screen under both themes; contrast asserted in `theme.test`/`themes.test`). Needs a dev-client
  rebuild first: `app.json` `userInterfaceStyle` is now `"automatic"` and only applies natively after
  one. Design: `docs/DESIGN.md` §8. Checklist:
  1. Every screen in both modes (Today, Journey, Field Guide, Exercise detail, Generate, Plan, Active
     Workout, Debrief, Completion, Settings, sheets, toasts).
  2. An outdoor full-sun glance test of Daybreak — can you read the set, the clock and the Done
     button at arm's length mid-set? That is the whole point of the mode.
  3. The Workout `theme-toggle` (sun/moon, left of Home) mid-session: switches live, no lost state, the
     preference persists, Settings' Appearance reflects it.
  4. System following iOS appearance live, including the automatic switch at sunset, with the app
     foregrounded.
  5. Status bar, keyboard (`keyboardAppearance`) and native stack headers follow the theme.
  6. Completion: the stamped headline (fill `teal`, `vivid.gold` shadow, no glow) plus confetti and
     orbs on paper.
  7. Tinted chips and badges (Daybreak tints are 8% alpha) — legible, and distinguishable from
     `surface`/`bg`?
  8. Cards' shadow on paper (`elevation.card`), the Switch thumb, Toast and tab bar lift.
  9. Band-chip labels on mid-tone swatches: BandChip's pre-existing 0.45 luminance threshold may pick
     the wrong legend on a few mid-tone bands; swatches are mode-invariant, so check each. The
     workout hero and rest "Up next" now show the band as a large filled swatch (`BandChip
size="lg"`): check it reads at arm's length, the B3 near-black swatch stands off the card in
     Midnight, and a long custom label (e.g. "Thin orange") still fits beside the anchor badge.
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
  the New Architecture ignores `minimumFontScale` and fell to ~4pt (Journey "Journey Markers" tiles).
  Jest-verified only. On a device: the Journey tiles with a 4-digit Sets completed value, the Workout
  clock and both ring numerals, the Completion counters, a long exercise name on Exercise detail and
  in the Workout header, Debrief set squares, passport stamps, the Today hero title (2 lines) and the
  Plan focus. Watch for a one-frame flash of ellipsized text before the first fit (a clipped text
  is drawn at full size until its first layout reports the room). Re-run the generator if the fonts
  are upgraded: `python3 tools/font_metrics.py --check` exits 1 when stale.
- **Logo source is low-res.** `app/assets/logo-source.png` is 430x542; the icon and splash are upscaled from it by `tools/build_brand_assets.py` (alpha-mask re-render). Replace with a vector or 2x+ export and re-run the script for crisp edges.
- **Show the app version in Settings' footer.** `expo-constants` is hoisted in by `expo` but not declared in
  `app/package.json`; add it (`npx expo install expo-constants`) and read `Constants.expoConfig?.version`.
- **Ladder rungs with no sibling exercises**, so they repeat every session at that level: `horizontal_push` l7–l9, `horizontal_pull` l4–l8, `anti_extension` l4 and l6. All are high rungs nobody currently occupies — fill them when someone gets there.

---

## Problems with Individual Exercises

_Use this section to backlog changes to individual exercise details_

- **Do scapular push-ups warrant a** `shoulder_overhead` **tag?** The library carried the same movement twice with different tagging — the purpose-built warm-up record had only `wrist_extension`, `bw-scap-push-up` also has `shoulder_overhead`. Merging the duplicates (track 13) kept the stricter one, deliberately: loosening a §13.2 safety tag is not a refactor's call. If it is over-cautious, dropping it gives a shoulder-limited user one more upper warm-up.

---

## Requested Exercises

_List exercises that you'd like to incldue in the library here. Any exercise you want to remove should be disabled through the Exercise Details page_

---

## Future Features

- **Find a workout by focus ("when was my last leg day?").** Track 27 lets you page the Logbook back
  month by month and open any day, but there is no filter or search list. Deliberately not built:
  a focus filter over `getCompletedSessionsInRange` (or a flat "recent workouts" list grouped by
  focus) would answer it directly.
- **Weekly-volume charts / a Progress hub.** Track 27 puts graphs only on Exercise detail and Trail
  progress pages (per-exercise and per-movement-group best set). Weekly volume, sets per muscle group
  or a top-level Progress tab were deliberately left out; `ProgressChart` and `chartGeometry` are
  the pieces to build on.
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
- **Per-exercise band ladder — device pass owed, and loose ends.** Tracks 34-35
  (`docs/handoff/STATUS-34-accessory-micro-progression.md`, `STATUS-35-band-to-b5.md`, Jest-verified
  only). Every main exercise with no progression family (cardio excluded), and every band exercise
  drawn from a rung below its family's current one, climbs its own ladder: reps, then the next band,
  all the way to B5, then tempo/rest/sets. The current rung keeps its authored-range cap (reaching
  it unlocks the next rung). Timed holds climb 5s a session. On a device: finish an accessory at
  target rated "just right" and check the next prescription is one step harder; get a passed-rung
  band exercise drawn and check it starts on the band above its range. Loose ends, not built:
  (1) nothing on Summary/Journey says an exercise's own ladder moved (`AccessoryProgressionEvent`s
  are computed and dropped); (2) a timed exercise still spends a tier on "tempo +1s", which a hold
  can't show; (3) the family path still resets reps to the bottom on a heavier band even when every
  set met target on it, and still reads a followed recovery-day band drop as the user going lighter;
  (4) on an easy or hard day `isDifficultyEligible` keeps passed-rung exercises tagged outside that
  day's tier out of the draw — with bands now climbing to B5, an "easy"-tagged exercise at B4 is no
  longer easy, so that tag may want to stop gating passed rungs; (5) bodyweight passed-rung
  exercises still take the family's projected tier.
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
