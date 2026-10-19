/**
 * Badges (Track 38a) — permanent awards for milestones. Pure data + functions: the store gathers a
 * `BadgeFacts` snapshot, the engine decides what is earned, the app displays it. Nothing here
 * reads storage, and nothing is ever taken away (invariant 4): there are no streak or expiring
 * badges, and a locked badge only ever shows neutral progress.
 */

export type BadgeCategory = 'showing_up' | 'climbing' | 'pushing' | 'exploring';

/** Ring colour of the emblem. `summit` is always the top badge of a multi-badge series. */
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'summit';

/** Display order of categories — also the sort order of `evaluateBadges`. */
export const BADGE_CATEGORIES: readonly BadgeCategory[] = [
  'showing_up',
  'climbing',
  'pushing',
  'exploring',
];
export const BADGE_TIERS: readonly BadgeTier[] = ['bronze', 'silver', 'gold', 'summit'];

/**
 * A flat, serializable snapshot of everything badges are measured against. The store fills it in.
 * Unless a field says otherwise: lifetime, completed sessions only, main-section work only, and
 * a "week" is an ISO week of `local_date` (invariant 6). Every count is >= 0.
 */
export interface BadgeFacts {
  /** Completed sessions. */
  sessionsCompleted: number;
  /** Sum of active minutes over completed sessions (whole minutes, rounded per session). */
  totalMinutes: number;
  /** Distinct `isoWeekKey(local_date)` values with at least one completed session. Not consecutive. */
  distinctActiveWeeks: number;
  /** Distinct `Focus` values of completed sessions (e.g. 'upper', 'legs'). */
  focusesTrained: string[];
  /** Completed sessions whose difficulty was set to Hard. */
  hardSessionsCompleted: number;
  /** Completed sessions where every planned main set was completed and there were >= 6 main sets. */
  cleanSweepSessions: number;
  /** Active minutes of the longest single completed session. */
  longestSessionMinutes: number;
  /** Completed sessions that started before 07:00 local time (`utc_instant` + `tz_id`). */
  earlySessions: number;
  /** Completed sessions that started at or after 21:00 local time. */
  lateSessions: number;
  /** Count of `level_up` milestones. */
  levelUpsTotal: number;
  /** Best 1-based display rung reached across all families (0 if none). */
  highestLevelOrdinal: number;
  /** Family ids currently on their top rung (best-ever is fine; the store may keep either). */
  familiesAtTop: string[];
  /** Number of progression families in the library. */
  familyCount: number;
  /** Number of families at display rung 3 or higher. */
  familiesAtOrAbove3: number;
  /** Count of `best_set_pr` milestones. */
  bestSetPrsTotal: number;
  /** Most `best_set_pr` milestones earned in a single session. */
  maxPrsInOneSession: number;
  /** Reps over completed main sets. */
  lifetimeReps: number;
  /** Seconds over completed timed-hold main sets. */
  lifetimeHoldSeconds: number;
  /** Completed main sets. */
  lifetimeSets: number;
  /** Index in `BAND_ORDER` of the heaviest band used on a completed main set; -1 if none. */
  heaviestBandOrdinal: number;
  /** Distinct exercise ids with at least one completed main set. */
  distinctExercisesPerformed: number;
  /** Whether Passport is switched on. Passport badges measure 0 when it is off. */
  passportEnabled: boolean;
  citiesVisited: number;
  countriesVisited: number;
  /** Completed sessions that came 14 or more days after the completed session before. */
  comebacks: number;
  /** Recovery weeks finished (rest counts). */
  recoveryWeeksCompleted: number;
}

export interface BadgeDefinition {
  /** Permanent string id, `<series>_<threshold>`. Never renamed, never an index. */
  id: string;
  series: string;
  tier: BadgeTier;
  category: BadgeCategory;
  name: string;
  /** Positive copy only; never mentions a gap, a miss or a deficit. */
  description: string;
  /** An `IconName` from `app/src/ui/Icon.tsx` (kept a plain string so the engine stays RN-free). */
  icon: string;
  /** Hidden until earned (a "?" while locked). */
  hidden?: boolean;
  /** No longer awarded, but earned rows still resolve. */
  retired?: boolean;
  /** Only meaningful when Passport is on; the UI hides these when it is off. */
  passport?: boolean;
  target: number;
  /** Earned when `measure(facts) >= target`. The same number drives progress. */
  measure: (facts: BadgeFacts) => number;
}

export interface BadgeProgress {
  current: number;
  target: number;
  /** 0..1 */
  fraction: number;
}
