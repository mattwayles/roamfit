## Track: 38 — Badges

Last updated: 2026-10-18

A badge system: permanent awards for milestones, meant to keep people coming back, climbing the
ladders, and pushing a little harder inside a workout. This file is both the plan and the running
log. Sub-tracks run **in order**, one agent each: 38a → 38b → 38c → 38d.

### Done

- [x] Plan written (this file + BACKLOG section)

### In progress

- 38a — not started.

### Next

1. **38a — Engine: catalog + evaluator** (`packages/engine/src/badges/`)
2. **38b — Store: persistence, facts, award at completion, backfill** (`packages/store`)
3. **38c — App: badge emblem, Badges screen, Journey card** (`app/src`)
4. **38d — App: badges on the completion screen + glossary + share** (`app/src`)

---

## Design

### Rules (these come from the project's invariants, so they aren't up for debate)

- **Never punish (invariant 4).** A badge is never taken away, even if a ladder steps back, an
  exercise gets disabled, or a session is edited. No streak badges and nothing based on consecutive
  days or weeks. Nothing expires, no limited-time badges, no "you missed" copy. A locked badge
  shows neutral progress ("12 of 25"), never a deficit.
- **Stable ids (same rule as invariant 5).** Every badge tier has its own permanent string
  `badge_id` (e.g. `sessions_25`). Never an index. Never renamed. A retired badge stays in the
  catalog with `retired: true` so earned rows still resolve.
- **Engine decides.** Whether a badge is earned is a pure function in `packages/engine`. The
  store only gathers facts and saves the result, and the app only displays it. The LLM never
  touches badges.
- **Offline.** Badges are awarded inside the `completeSession` transaction. No network.
- **Calendar math on `local_date` (invariant 6).** "Distinct weeks" uses `isoWeekKey(localDate)`.
  Time of day comes from `utc_instant` + `tz_id`, converted to local time, never from UTC hours.
- **Safety.** Nothing rewards `too_hard` feedback, skipping rest, or going past the effort cap.
  "Push harder" badges reward best sets, clean sessions and Hard-difficulty sessions, all of which
  the engine has already made safe.

### Engine (38a): `packages/engine/src/badges/`

- `types.ts`
  - `BadgeCategory = 'showing_up' | 'climbing' | 'pushing' | 'exploring'`
  - `BadgeTier = 'bronze' | 'silver' | 'gold' | 'summit'` (summit = the top one in a series)
  - `BadgeFacts`: a plain snapshot the store fills in (all counts are lifetime, completed
    sessions only, main-section work only unless noted):
    ```
    sessionsCompleted, totalMinutes, distinctActiveWeeks, focusesTrained: string[],
    hardSessionsCompleted, cleanSweepSessions /* every planned main set completed, ≥ 6 main sets */,
    longestSessionMinutes, earlySessions /* local start < 07:00 */, lateSessions /* ≥ 21:00 */,
    levelUpsTotal, highestLevelOrdinal /* best 1-based rung across families */,
    familiesAtTop: string[] /* family ids on their top rung */, familyCount,
    familiesAtOrAbove3 /* count */, bestSetPrsTotal, maxPrsInOneSession,
    lifetimeReps, lifetimeHoldSeconds, lifetimeSets,
    heaviestBandOrdinal /* index in BAND_ORDER of the heaviest band used on a completed main set, -1 none */,
    distinctExercisesPerformed, passportEnabled, citiesVisited, countriesVisited,
    comebacks /* sessions done ≥ 14 days after the one before */, recoveryWeeksCompleted
    ```
    Keep this flat and serializable. When computing it would mean re-scanning everything, the
    store can do that (SQLite is local and fast); measure if it ever matters.
- `catalog.ts`: `BADGES: readonly BadgeDefinition[]`, where each definition has
  `{ id, series, tier, category, name, description, icon, hidden?, retired?, target, measure: (f) => number }`.
  Earned when `measure(f) >= target`, so the same function also drives progress. Badges you either
  have or don't (e.g. "First step") use `target: 1`.
- `evaluate.ts`
  - `evaluateBadges(facts, earnedIds: ReadonlySet<string>): BadgeDefinition[]` returns badges that
    are newly earned, ordered by category and then tier, skipping retired ones.
  - `badgeProgress(facts, def) → { current, target, fraction }`, with current capped at target.
  - `nextBadges(facts, earnedIds, n)` returns the n unearned, non-hidden badges closest to done,
    by fraction, ties broken by catalog order.
- Export everything from `packages/engine/src/index.ts`.

**Starter catalog.** Names fit the trail/travel theme and the copy is positive. Each series is
one tier per threshold, with id `<series>_<threshold>`:

| Category | Series (id prefix) | Thresholds | Notes |
|---|---|---|---|
| showing_up | `sessions` | 1, 5, 10, 25, 50, 100, 250, 500 | 1 = "First Steps" |
| showing_up | `minutes` | 60, 300, 1000, 3000, 6000 | total active minutes |
| showing_up | `active_weeks` | 4, 12, 26, 52, 104 | distinct ISO weeks with ≥1 session, **not consecutive** |
| showing_up | `all_rounder` | 1 | trained every focus at least once (focus list from engine types) |
| showing_up | `early_bird` / `night_owl` | 1 | hidden; 1 session started before 07:00 / at 21:00 or later local |
| showing_up | `comeback` | 1, 3 | "Back on the Trail". Copy celebrates coming back and never mentions the gap |
| showing_up | `recovery_week` | 1 | finished a recovery week; rest counts |
| climbing | `level_ups` | 1, 5, 10, 25, 50 | 1 = "First Rung" |
| climbing | `high_rung` | 4, 7, 10, 12 | reached rung N on any ladder (display ordinal; the family cap is 12) |
| climbing | `summit` | 1, 3, all | top rung of any ladder, 3 ladders, all of them (`all` target = familyCount) |
| climbing | `well_rounded` | 1 | every ladder at rung 3 or higher |
| climbing | `heavy_band` | B3, B4, B5, stacked | heaviest band used on completed main work (target = BAND_ORDER index) |
| pushing | `best_sets` | 1, 10, 25, 50, 100 | best-set PRs |
| pushing | `record_day` | 1 | 3+ best sets in one session (hidden) |
| pushing | `hard_sessions` | 1, 10, 25, 50 | finished sessions set to Hard difficulty |
| pushing | `clean_sweep` | 1, 10, 25 | every planned main set completed, at least 6 main sets |
| pushing | `reps` | 1000, 5000, 10000, 25000, 50000 | lifetime reps |
| pushing | `hold_time` | 600, 3600, 10800 sec | lifetime seconds on timed holds |
| pushing | `long_haul` | 45, 60 | one session of ≥ N active minutes |
| exploring | `exercises_tried` | 10, 25, 50, 100 | distinct exercises performed |
| exploring | `cities` | 3, 10, 25 | only shown when Passport is on (`measure` returns 0 and the UI hides it when off) |
| exploring | `countries` | 2, 5 | same rule as cities |

The final thresholds and names are up to the 38a agent if a number turns out to be silly for
this app (e.g. hold-time totals). Write down any change under Decisions.

Tests (`badges.test.ts`): every id is unique and matches `^[a-z_]+_[a-z0-9]+$`, every series has
strictly increasing thresholds, an empty-facts user earns nothing, crossing each threshold earns
exactly that tier, already-earned badges are never returned again, evaluation is idempotent,
retired badges are never awarded, `nextBadges` ordering, and a **snapshot of the id list** so
that renaming an id fails a test (the same protection level ids get).

### Store (38b): `packages/store`

- Migration `0034_badges.sql` + Drizzle table `earnedBadges` (`earned_badges`):
  `badge_id TEXT PK`, `user_id`, `earned_at` (utc), `local_date`, `session_id` (nullable),
  `retroactive INTEGER bool`, `seen_at` (nullable), `payload` JSON (facts excerpt, e.g. `{value}`).
  Register it the same way 0033 is (`migrations/data.ts`). There is one PK per badge_id, so a
  badge can't be awarded twice.
- `repositories/badges.ts`: `getEarnedBadges`, `getEarnedBadgeIds`, `insertEarnedBadges`,
  `markBadgesSeen(ids, now)`, `countUnseen`.
- `badgeFacts.ts`: `buildBadgeFacts(db, library, families): BadgeFacts`, built from `sessions`
  (completed), `session_entries` + `set_logs` (main section, `completed`), `progression_state`,
  `exercise_state`, `milestones` (level_up, best_set_pr counts and per-session max), and the
  passport summary logic (reuse whatever `buildPassportSummary` reads, or move its core into the
  store if it's app-only). Reuse `statsRepo` counters where they exist.
- `awardBadges(db, {library, families, sessionId|null, localDate, retroactive}, now) → BadgeDefinition[]`:
  facts, then evaluate, then insert. 
- **Completion.** Call `awardBadges` at the end of the `completeSession` transaction (after
  milestones, before the status update is fine, since facts must count this session, so either
  treat this session as completed when building facts or call it after the status update inside
  the same transaction; the second is simpler). Add `newBadgeIds: string[]` to
  `CompleteSessionResult`. A badge failure must **never** fail completion: wrap it in try/catch
  and log through instrumentation.
- **Backfill.** `backfillBadges(db, library, families, now)` awards anything the user already
  qualifies for with `retroactive: true` and `session_id: null`. It runs once on app start after
  migrations (wherever `ensureProgressionStatesInitialized` and the other startup ensures run)
  and is idempotent, so adding catalog entries later also backfills. Retroactive badges are never
  celebrated on Summary. They show a "NEW" dot on Journey until seen.
- Tests: migration applies, facts from fixture sessions (use `testHarness` / `testFixtures`),
  awarding at completion, no double award, a failure inside badge code doesn't break completion,
  backfill is silent and idempotent, and local-date week math across a timezone change.
- Not syncing to Firestore (the same scope cut as `progression_state`). Add it to the BACKLOG sync line.

### App (38c): emblem, Badges screen, Journey card

- `app/src/components/BadgeEmblem.tsx`: an embroidered-patch look with `react-native-svg`
  (already installed). Shape by category (showing_up = circle, climbing = shield,
  pushing = hexagon, exploring = rounded square), ring colour by tier taken from theme accents (no
  raw hex; both Midnight and Daybreak), glyph from the existing `Icon` set. Locked = desaturated
  outline with no glyph fill. Hidden + locked = "?" glyph. Sizes 40/64/120. Accessibility label
  is "<name>, earned <date>" or "<name>, locked, <current> of <target>".
- `app/src/lib/badges.ts`: a pure view model (`buildBadgeShelf(earned, facts)`) that groups by
  category, gives earned rows a date, gives locked rows progress, hides passport badges when
  Passport is off, and hides hidden badges until earned. Tested.
- `BadgesScreen` (a new stack route `Badges`): header count "18 of 64 earned", an
  "Almost there" row (`nextBadges`, 3), then one section per category as a grid of emblems. Tap
  opens a `Sheet` with a large emblem, description, earned date (and "from <session date>" linking
  to `SessionHistory` when `session_id` is set) or progress. Opening the screen calls
  `markBadgesSeen` for the ones on screen.
- Journey: a "Badges" card (near Passport) with the earned count, the last 3 earned emblems, a
  NEW dot when there are unseen badges, and the closest locked badge as a progress line. Tapping
  it opens Badges. Empty state: "Your first badge comes with your first workout."
- Load through `useDashboardData` (add `badges` to `DashboardData`) so there's no second load path.
- Tests: emblem a11y labels, shelf view model, BadgesScreen renders earned and locked, the sheet
  opens, seen gets marked, and the Journey card shows NEW.

### App (38d): completion screen

- Summary: after the level-up/Mastery highlights and before the passport stamp, newly earned
  badges (`result.newBadgeIds`) land one beat at a time as a `BadgeEarnedCard` (emblem pops in,
  "BADGE EARNED" eyebrow, name, description, share). Add `badges: number[]` to
  `buildCompletionTimeline` (gap like highlights, but shorter, ~900ms). At most 3 cards; anything
  past that is a single "+N more badges" chip that opens Badges. Reduce Motion means a still
  card with no pop. Reuse `cueLevelUp` / haptics for the sound and haptic. Don't add a new asset
  unless one is cheap to make with the existing `tools/make_*_sound.py` pattern.
- Mark celebrated badges seen.
- Share text, the same as the stamp: "Earned the <name> badge on Wanderlift".
- Glossary entry "Badges": how they're earned, that they're permanent, and that there are no streaks.
- Tests: the timeline with badges, Summary shows cards in order, caps at 3 + chip, nothing shown
  for retroactive badges, and the Reduce Motion path.

### Decisions / gotchas

- **The user has uncommitted work in progress** in `app/src/components/OnboardingFlow.tsx`,
  `app/src/components/SettingsList.tsx`, `app/src/lib/equipment.ts`,
  `app/src/screens/GenerateScreen.tsx`, `package-lock.json`, `packages/store/src/repositories/users.ts`.
  **Do not edit, stage, format, or commit those files.** Stage only your own paths with
  `git add <path>`, never `git add -A` / `git commit -a`. If `npm run check` fails *only*
  because of those files, don't fix them. Note it here and in your report.
- No settings toggle to turn badges off in v1 (parked in BACKLOG). Passport badges follow the
  Passport opt-in.
- No new dependencies expected (`react-native-svg` is already installed).
- No "next badge" nudge on Today in v1. Journey only, so Today stays uncluttered (parked).
