## Track: 44 — Badges page redesign

Last updated: 2026-10-21 (track done)

### Done

- [x] 44a engine `hint` + catalog hints + test — ce92cc9
- [x] 44a BadgeEmblem `showProgress` arc (grid + Almost there) — 1033d01
- [x] 44b view models `buildSeriesTrails` / `tierTally` + tests - see git log
- [x] 44b BadgeTrail, BadgesHero, BadgesScreen swap, tests - see git log
- [x] 44a sheet: Earned during link, Share (text), series Pips + prev/next, locked hint,
      BACKLOG image-share item — 9689f22
- [x] 44c delight pass: stitch-in, summit shimmer, tilt-to-sheen, haptics, tests - fa1f692

- [x] 44d item 1 Collection | Timeline toggle, `buildBadgeTimeline`, `BadgeTimeline`, item 5 lint
      fix - 8cb9495
- [x] 44d item 2 riddles (`riddle` on BadgeDefinition/SeriesSpec, engine test, sheet shows it) and
      a "N of M secrets found" line (`secretsFound`, `badges-secrets`) placed under Almost there,
      above the first section, Collection view only - see git log

### In progress

- Nothing. Track 44 (a-d) is DONE. Only the device passes in BACKLOG remain.

### Done (44d, items 3-4)

- [x] item 3: `AlmostThereCard` (thin bar, "Within reach today"), `withinReach` rule, Generate route
      params `difficulty`/`minutes` pre-filled in GenerateScreen state. The label+action also show
      in the locked badge sheet (Almost there only lists badges with progress > 0, so a recovery
      week or 45-minute long haul would otherwise never surface). Rule is deliberately narrow:
      sessions/hard/clean_sweep when one short; recovery_week; long_haul 45 only (60 left out);
      minutes (<=20 left) and reps (<=100 left). comeback/active_weeks/climbing/best sets never.
      Clean sweep, sessions, minutes, reps get the label without an action (no Generate setting
      maps directly).
- [x] item 4: `CATEGORY_INTROS` under each section eyebrow (`badges-intro-<category>`) - see git log

### Next

- (44b done) series "trail" rows replacing the flat grid (one row per series, nodes on a path, partial
  ring on the current node, tap opens a series sheet with every tier on a vertical trail with
  dates; one-off badges in a compact "Singles" grid per category) + hero header (newest badge
  featured, per-category patches with counts that scroll to the section, tier tally).
- 44c: delight pass — unseen badges "stitch in" on first view with expo-haptics success; haptic
  tick on press; tilt-to-sheen on the 120px sheet emblem (Animated + PanResponder) for
  gold/summit; soft shimmer on earned summit emblems. All motion off under Reduce Motion.
- 44d: Collection | Timeline toggle (month-grouped earned badges from shelf.recent, linked
  workout) + riddle hints for hidden badges with "N of M secrets found"; smarter Almost there
  (progress bar; "Within reach today" label + one-tap into Generate with a suggested setting —
  the engine still selects exercises); one-line category intros under each section eyebrow.

### Decisions / gotchas

- Test-suite flake is wider than WorkoutScreen: a random suite (BandChip, SpotifyButton, HomeScreen,
  JourneyScreen) 'fails to run' under full-load `npm run check`, also on a clean tree. Rerun.

- Sheet helpers live in `lib/badges.ts` (`seriesContext`, `earnedDuringLabel`); the sheet's emblem
  also passes `showProgress` (a locked badge shows its arc at 120px). `EarnedDuring` in
  BadgesScreen reads `sessionsRepo.getCompletedSessionDetail` + `buildSessionHistoryView`.
- Progress arc uses per-category stroke perimeters (`PERIMETER` in BadgeEmblem) with a dasharray,
  because react-native-svg's `pathLength` is not reliable across shapes. Change a shape, update it.
- Jest: a second render in the same file after an async-heavy test hits a broken act environment;
  `BadgesScreen.session.test.tsx` is its own file for that reason.
- Hints: series-level `hint` on SeriesSpec; hidden badges have none (test enforces both ways).

- Design approved by the user; do not re-litigate. No reanimated: RN Animated only.
- Image share (react-native-view-shot) needs a native rebuild: parked in BACKLOG, text share only.
- Commit bbd100b had removed the old "From your <date> workout" link; 44a deliberately
  reinstates it as an "Earned during" row, per the approved design.
- Invariant 4: progress is always neutral ("12 of 25"); hints are positive, never a deficit.

- 44b: `BadgeEmblemSize` is now any number (trail nodes are 16-38px). One `Sheet` serves both the
  badge and the series views (a second Modal presented as the first dismisses can be dropped on
  iOS); from a trail the badge view gets "All in this series" back. NEW dots on trail rows
  (`trail-<series>-new`) and on the series sheet emblems replace the grid emblem dot; singles keep
  theirs. A series is a trail only if the shelf shows 2+ of its members (same rule as
  `seriesContext`). Trail strip sizes come from `trailNodeSizes(trail, width)` (earned emblems
  shrink to 16px floor, so 8 tiers fit with no horizontal scroll). Hero scroll-to-section uses
  `Screen`'s existing `scrollRef` plus each section's `onLayout` y.
- Test ids: `trail-<series>`, `trail-tier-<id>`, `badges-patch-<category>`, `badges-hero-*`,
  `badges-count` (now a single string child). Singles keep `badge-<id>`.

- 44c: stitch-in is a native-driven scale+opacity pop of the whole emblem with the glyph fading in
  220ms later (NOT an animated strokeDashoffset: svg props can't use the native driver and the
  dash draw was not verifiable without a device). `animateIn` replays each time it turns true.
  Motion lives in `components/badgeMotion.ts`; BadgeEmblem only mounts the Reduce Motion
  subscription (`MotionEmblem`) when `animateIn`/summit `shimmer`/`sheen` is set, so the other
  ~60 emblems on the page stay hook-free. Shimmer and tilt highlight are the same `SheenBand`
  (gradient Rect clipped to the outline by a ClipPath, x animated on the JS driver); shimmer is
  one module-level looping value shared by all summit emblems. `PressableScale` already ticks
  `selection` on every press (cells, trail rows, hero, IconButton prev/next), so no extra tick
  was added; earned-summit open uses `haptics.medium` via `openBadge`. Success haptic fires once
  per focus when anything was unseen (also under Reduce Motion: it is a haptic, not motion).
  TiltSheen's PanResponder claims only touches that start on the emblem.
- Motion is NOT verified visually (Jest cannot); needs a device pass: stitch-in feel, shimmer
  subtlety on Daybreak, tilt vs. the native sheet's swipe-down, JS-driver sheen smoothness.
  Add to BACKLOG verification if not already there.
- Jest: RNTL render is async here (`await render`, `await fireEvent`); sync render trips the act
  environment. The RN accessibility mock is a plain jest.fn, so a `mockResolvedValue(true)` leaks
  across tests unless reset in afterEach.
