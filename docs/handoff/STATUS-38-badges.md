## Track: 38 — Badges

Last updated: 2026-10-18

A badge system: permanent awards for milestones, meant to keep people coming back, climbing the
ladders, and pushing a little harder inside a workout. This file is both the plan and the running
log. Sub-tracks run **in order**, one agent each: 38a → 38b → 38c → 38d.

### Done

- [x] Plan written (this file + BACKLOG section)
- [x] 38b store: migration 0034 + repo (babbd1d), facts + award at completion + `newBadgeIds` + backfill (2b092cd), startup hook + BACKLOG sync line (see git log, `Badges (Track 38b, 3)`)
- [x] 38a engine catalog + evaluator (`packages/engine/src/badges/`, exported from the engine index) - commit bc33ae9

### In progress

- 38c - not started. App: `BadgeEmblem`, `lib/badges.ts` view model, Badges screen, Journey card, `badges` in `DashboardData`. See the 38b notes below for the store API.

### Next

1. **38c — App: badge emblem, Badges screen, Journey card** (`app/src`)
2. **38d — App: badges on the completion screen + glossary + share** (`app/src`)

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

- **Work happens in the worktree `/Users/mattwayles/Development/wanderlift-badges`, branch
  `track-38-badges`.** The user is editing the main checkout (`../wanderlift`, on `master`) at the
  same time, so never touch that directory. Commit on `track-38-badges`. The user merges.
  Stage only your own paths (`git add <path>`).
- **Baseline `npm run check` (2026-10-18):** engine/data/store/functions are all green. App Jest
  has timing-sensitive screen tests (e.g. `WorkoutScreen.timedDurationAdjust`,
  `HomeScreen.banners`) that sometimes time out under full parallel load and pass when rerun alone.
  If a failure is in a file you didn't touch, rerun that file alone before treating it as yours.
- No settings toggle to turn badges off in v1 (parked in BACKLOG). Passport badges follow the
  Passport opt-in.
- No new dependencies expected (`react-native-svg` is already installed).
- **Next badge nudge on Today — requested by the user (2026-10-18), part of 38c.** A compact row near
  the Next Unlock card: the closest locked badge (`nextBadges(facts, earned, 1)`) with its emblem and
  neutral progress ("Next badge: <name> · 18 of 25"). Tap opens Badges. Before any badge it points at
  the first one. Never deficit copy.

### 38a outcome: catalog changes and the BadgeFacts contract (read before 38b)

Public API (all from `@roamfit/engine`): `BADGES`, `evaluateBadges(facts, earnedIds)`,
`badgeProgress(facts, def)`, `nextBadges(facts, earnedIds, n)`, `getBadge(id)`, `isBadgeEarned`,
types `BadgeFacts/BadgeDefinition/BadgeProgress/BadgeCategory/BadgeTier`, `BADGE_CATEGORIES`,
`BADGE_TIERS`, `LADDER_FAMILY_COUNT`, `ALL_ROUNDER_FOCUSES`. `BadgeDefinition.icon` is a plain string
naming an `IconName` in `app/src/ui/Icon.tsx` (38c should add a test that every catalog icon is a
valid `IconName`). New field `passport?: true` marks cities/countries badges: the 38c shelf hides
them when `facts.passportEnabled` is false (their `measure` is 0 then; `nextBadges` skips them).

Catalog deviations from the table above:
- `all_rounder` id is `all_rounder_4` (target 4 = number of focuses done, so progress reads "3 of 4").
  Focuses counted are `upper, abs, legs, full`; **cardio is excluded** (add-on, not a planned day).
  `focusesTrained` may still contain `'cardio'`; it is ignored.
- `record_day` id is `record_day_3` (target 3 best sets in one session; `maxPrsInOneSession`).
- `well_rounded` id is `well_rounded_all` (target `LADDER_FAMILY_COUNT` = 8, measure `familiesAtOrAbove3`).
- `summit` ids are `summit_1`, `summit_3`, `summit_all`; `summit_all` targets `LADDER_FAMILY_COUNT`
  (a constant, pinned to `familyLibrary.families.length` by a test), not `facts.familyCount`,
  because a definition's `target` is static. `familyCount` stays in the facts for UI use.
- `heavy_band` ids are `heavy_band_b3|b4|b5|stacked`; `measure = heaviestBandOrdinal + 1` and
  `target = BAND_ORDER index + 1` (so -1 = no band yet = 0, never negative). Stacked = `B5+B1`.
- Tiers: a lone badge is `gold`; in a multi-badge series the last is `summit`, the rest spread over
  bronze/silver/gold. All other ids/thresholds are exactly as the table. 73 badges total
  (inline snapshot in `badges.test.ts` pins every id; add new ones by appending to the snapshot).

BadgeFacts computation notes for 38b (everything lifetime, `status = completed` sessions only):
- Main-section, `set_logs.completed` rows only for: `lifetimeSets/Reps/HoldSeconds`,
  `distinctExercisesPerformed` (distinct exercise ids), `heaviestBandOrdinal`
  (`BAND_ORDER.indexOf(band)` of the heaviest actual band logged; -1 if none).
- `totalMinutes` / `longestSessionMinutes`: active minutes (whole minutes) per completed session.
- `distinctActiveWeeks`: distinct `isoWeekKey(local_date)` (from `repositories/stats.ts`). Not consecutive.
- `earlySessions` / `lateSessions`: local hour from `utc_instant` + `tz_id` (< 7 / >= 21), never UTC hours.
- `cleanSweepSessions`: every planned main set completed AND >= 6 main sets planned.
- `comebacks`: completed sessions whose `local_date` is >= 14 days after the previous completed
  session (`daysBetween` from the engine); the first session never counts.
- `highestLevelOrdinal` is the 1-based display rung, 0 if none; `familiesAtTop` are family ids on
  the top rung; `familiesAtOrAbove3` counts families at display rung >= 3.
- `focusesTrained`: distinct session `focus` values, `string[]`.
- Evaluate with `evaluateBadges(facts, earnedIds)`; the evaluator is retroactive-safe (it returns
  everything not yet earned that the facts qualify for), so backfill and completion share one call.

### 38b outcome: store API and notes for 38c / 38d

All from `@roamfit/store`:
- `badgesRepo` (`repositories/badges.ts`): `getEarnedBadges(db)` (newest first; `{badgeId, earnedAt, localDate, sessionId, retroactive, seenAt, payload}`),
  `getEarnedBadgeIds(db): Set<string>`, `insertEarnedBadges`, `markBadgesSeen(db, ids, now)` (keeps the first look), `countUnseen(db)`.
- `buildBadgeFacts(db, library, families): BadgeFacts`. For Journey/Badges screens: `facts = buildBadgeFacts(...)`, then
  `badgeProgress(facts, def)` / `nextBadges(facts, earnedIds, 3)` from the engine. 38c adds `badges` to `DashboardData` and builds it in `loadDashboardData`
  (`app/src/lib/useDashboardData.ts`). It is a full-history read; measure before caching.
- `awardBadges(db, {library, families, sessionId, localDate, retroactive}, now)` (throws), `awardBadgesSafely(...)` (never throws), `backfillBadges(db, library, families, now, tzId?)`.
- `seen_at`: NULL means the user has not been shown the badge (drives the NEW dot on Journey). The Badges screen calls `markBadgesSeen` for what is on screen; 38d
  marks celebrated completion badges seen.
- `retroactive`: true = found by the startup backfill, `session_id` NULL, `local_date` = the day it was found. Never celebrate these on Summary. false = earned in
  the completing session (`session_id` set), `payload.value` = the measure at award time.
- `newBadgeIds` comes from `CompleteSessionResult` (`completeSession`): ids earned by this completion only (never backfilled ones), in engine order (category, then tier).
  Resolve with `getBadge(id)` from the engine.
- Backfill runs in `loadDashboardData` on the first dashboard load of each launch (module-level `WeakSet<Db>`), not in `StoreProvider`.

Decisions that differ from the plan:
- Awarding runs *after* the session status flip inside the same transaction (the plan's "second option"), in a nested savepoint: an error rolls the award back,
  logs a `badge_error` signal event (`{stage, message}`; the signal type is TS-only, no migration) and completion still succeeds with `newBadgeIds: []`.
- Time of day (early/late) uses the session's `started_at` (falling back to `utc_instant`) through its own `tz_id`, since `utc_instant` is generation time.
- Cities/countries are counted over ALL completed sessions (the dashboard passport reads the latest 365). Cities = distinct app place label (city + region only if
  abbreviated + country code or name); the key is replicated in `badgeFacts.ts` because `formatPlace` is app-only. Countries = distinct `sessions.country`.
- `totalMinutes`/`longestSessionMinutes` round `actual_minutes` (fallback `estimated_minutes`). `recoveryWeeksCompleted` = completed sessions with `recovery_week_manual`.
- Clean sweep: planned = sum of `sets` over non-removed main entries; completed = completed main set logs.
- Not done: no Firestore sync of `earned_badges` (BACKLOG sync line updated).
