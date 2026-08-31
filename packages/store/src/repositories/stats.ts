/**
 * §11.3 rolled-up stats — maintained incrementally so the dashboard is instant offline and never
 * re-scans full history. `session_muscle_volume` (schema.ts) is the exact ledger the §14.3
 * hard-sets-per-muscle-14d metric and the §5.2 OVER-WORKED trailing-volume comparison read from,
 * filtered by `local_date` (a small indexed local query — the §11.3 cost note is about Firestore
 * *remote* document reads, not local SQLite scans of a bounded recent window).
 *
 * Week-streak decision (not specified numerically in spec.md): a "week" is the ISO calendar week
 * (Mon-Sun) containing a session's `local_date`. A week counts as "hit" once it has at least
 * `weekly_target` completed sessions. The streak is the number of consecutive hit weeks ending at
 * the most recent week that has *concluded or is in progress with the target already met* —
 * i.e. the current in-progress week counts as soon as it's hit, consistent with §9.1's "lumpy
 * lives, forgiving math" framing (it should credit a fast start to the week immediately, not wait
 * for the week to end). Documented here per CLAUDE.md rather than silently assumed.
 */
import { eq, gte } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';
import { isWithinRollingWindow } from '../dates';
import { EMA_ALPHA } from './exerciseState';

const USER_ID = 'local';
const ROLLING_WINDOW_DAYS = 7;
const HARD_SETS_WINDOW_DAYS = 14;
const TRAVEL_DENOMINATOR_FLOOR = 2;

export interface RolledUpStatsRecord {
  lifetimeSessionCount: number;
  rolling7dLocalDates: string[];
  weekStreak: number;
  travelDaysThisWeek: number;
  estimateAccuracyEma: number | null;
  lastSessionLocalDate: string | null;
  weeksSinceLastRecoveryWeek: number;
}

function rowToStats(row: typeof schema.rolledUpStats.$inferSelect): RolledUpStatsRecord {
  return {
    lifetimeSessionCount: row.lifetimeSessionCount,
    rolling7dLocalDates: JSON.parse(row.rolling7dLocalDates),
    weekStreak: row.weekStreak,
    travelDaysThisWeek: row.travelDaysThisWeek,
    estimateAccuracyEma: row.estimateAccuracyEma,
    lastSessionLocalDate: row.lastSessionLocalDate,
    weeksSinceLastRecoveryWeek: row.weeksSinceLastRecoveryWeek,
  };
}

export function ensureStats(db: Db, now: string): RolledUpStatsRecord {
  const existing = db
    .select()
    .from(schema.rolledUpStats)
    .where(eq(schema.rolledUpStats.userId, USER_ID))
    .all();
  if (existing.length > 0) return rowToStats(existing[0]);
  db.insert(schema.rolledUpStats).values({ userId: USER_ID, updatedAt: now }).run();
  return rowToStats(
    db.select().from(schema.rolledUpStats).where(eq(schema.rolledUpStats.userId, USER_ID)).all()[0],
  );
}

export function getStats(db: Db): RolledUpStatsRecord | null {
  const rows = db
    .select()
    .from(schema.rolledUpStats)
    .where(eq(schema.rolledUpStats.userId, USER_ID))
    .all();
  return rows.length > 0 ? rowToStats(rows[0]) : null;
}

/** ISO week key (`YYYY-Www`) for a `local_date`. Pure date-string arithmetic — Thursday-anchored
 *  per the ISO-8601 rule, so it's correct across year boundaries. */
export function isoWeekKey(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function computeWeekStreak(
  sessionLocalDates: string[],
  weeklyTarget: number,
  today: string,
): number {
  const countByWeek = new Map<string, number>();
  for (const d of sessionLocalDates) {
    const key = isoWeekKey(d);
    countByWeek.set(key, (countByWeek.get(key) ?? 0) + 1);
  }
  let streak = 0;
  let cursor = today;
  // Walk backward one week at a time from the current week.
  for (;;) {
    const key = isoWeekKey(cursor);
    const count = countByWeek.get(key) ?? 0;
    if (count >= weeklyTarget) {
      streak += 1;
      // Step back 7 calendar days to land in the previous ISO week.
      const [y, m, d] = cursor.split('-').map(Number);
      const prev = new Date(Date.UTC(y, m - 1, d - 7));
      cursor = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
    } else {
      break;
    }
  }
  return streak;
}

export interface MuscleVolumeEntry {
  muscle: string;
  sets: number;
  hardSets: number;
}

export interface RecordSessionCompletionInput {
  sessionId: string;
  localDate: string;
  weeklyTarget: number;
  muscleVolume: MuscleVolumeEntry[];
  estimatedMinutes: number;
  actualMinutes: number;
  /** §9.9 — this completed session was itself a Recovery Week (manual toggle or an accepted
   *  auto-suggestion). Resets the "weeks since last Recovery Week" counter below rather than
   *  incrementing it, mirroring §9.4's "credited, not penalized" framing. */
  recoveryWeekManual: boolean;
}

/** The one write call at completion. Appends the ledger rows, updates the singleton stats row.
 *  Bounded local recompute of week streak (reads `sessions.local_date` only, not entries). */
export function recordSessionCompletion(
  db: Db,
  input: RecordSessionCompletionInput,
  now: string,
): void {
  for (const entry of input.muscleVolume) {
    db.insert(schema.sessionMuscleVolume)
      .values({
        id: newId(),
        sessionId: input.sessionId,
        localDate: input.localDate,
        muscle: entry.muscle,
        sets: entry.sets,
        hardSets: entry.hardSets,
      })
      .run();
  }

  const stats = ensureStats(db, now);
  const rolling = [...stats.rolling7dLocalDates, input.localDate]
    // Trim to a generous 30-day tail — plenty for the 7-day window with no unbounded growth.
    .filter((d) => isWithinRollingWindow(d, input.localDate, 30));

  const allCompletedDates = db
    .select({ localDate: schema.sessions.localDate })
    .from(schema.sessions)
    .where(eq(schema.sessions.status, 'completed'))
    .all()
    .map((r) => r.localDate);

  const weekStreak = computeWeekStreak(allCompletedDates, input.weeklyTarget, input.localDate);

  const accuracySample =
    input.estimatedMinutes > 0
      ? Math.abs(input.actualMinutes - input.estimatedMinutes) / input.estimatedMinutes
      : 0;
  const estimateAccuracyEma =
    stats.estimateAccuracyEma === null
      ? accuracySample
      : stats.estimateAccuracyEma + EMA_ALPHA * (accuracySample - stats.estimateAccuracyEma);

  // §9.9 auto-suggest trigger (issue #12) — "every 6-8 weeks of consistent training." Tracked
  // incrementally (no full-history rescan): a Recovery Week session zeroes the counter; any other
  // session bumps it by 1 the first time a *new* ISO week produces a completed session (so
  // multiple sessions in the same week don't over-count, and a week with zero sessions doesn't
  // count as "consistent training" either — it simply doesn't advance the counter until training
  // resumes, which is the correct "forgiving math" behavior per §9.1's own framing).
  const isNewWeek =
    stats.lastSessionLocalDate === null ||
    isoWeekKey(stats.lastSessionLocalDate) !== isoWeekKey(input.localDate);
  const weeksSinceLastRecoveryWeek = input.recoveryWeekManual
    ? 0
    : isNewWeek
      ? stats.weeksSinceLastRecoveryWeek + 1
      : stats.weeksSinceLastRecoveryWeek;

  db.update(schema.rolledUpStats)
    .set({
      lifetimeSessionCount: stats.lifetimeSessionCount + 1,
      rolling7dLocalDates: JSON.stringify(rolling),
      weekStreak,
      lastSessionLocalDate: input.localDate,
      estimateAccuracyEma,
      weeksSinceLastRecoveryWeek,
      updatedAt: now,
    })
    .where(eq(schema.rolledUpStats.userId, USER_ID))
    .run();
}

/** §9.9 — "auto-suggested every 6-8 weeks of consistent training." Pure predicate over the
 *  already-maintained counter; the caller decides what to do with `true` (show a banner) — this
 *  never fires anything itself, consistent with §1.1 (nothing here nags). */
export function shouldSuggestRecoveryWeek(stats: RolledUpStatsRecord): boolean {
  return stats.weeksSinceLastRecoveryWeek >= 6 && stats.weeksSinceLastRecoveryWeek <= 8;
}

/** §9.1 rolling 7-day session count against `weekly_target`, with §9.3's travel-day denominator
 *  reduction (floor of 2) already applied to the denominator the caller compares against. */
export function rollingSessionCount(stats: RolledUpStatsRecord, today: string): number {
  return stats.rolling7dLocalDates.filter((d) =>
    isWithinRollingWindow(d, today, ROLLING_WINDOW_DAYS),
  ).length;
}

export function effectiveWeeklyDenominator(
  weeklyTarget: number,
  travelDaysThisWeek: number,
): number {
  return Math.max(TRAVEL_DENOMINATOR_FLOOR, weeklyTarget - travelDaysThisWeek);
}

export function recordTravelDay(db: Db, now: string): void {
  const stats = ensureStats(db, now);
  db.update(schema.rolledUpStats)
    .set({ travelDaysThisWeek: stats.travelDaysThisWeek + 1, updatedAt: now })
    .where(eq(schema.rolledUpStats.userId, USER_ID))
    .run();
}

/** §14.3 — hard sets per muscle group, trailing 14 days, read straight from the ledger. */
export function hardSetsByMuscle14d(db: Db, today: string): Record<string, number> {
  const cutoff = isWithinRollingWindowCutoff(today, HARD_SETS_WINDOW_DAYS);
  const rows = db
    .select()
    .from(schema.sessionMuscleVolume)
    .where(gte(schema.sessionMuscleVolume.localDate, cutoff))
    .all();
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.hardSets > 0) out[row.muscle] = (out[row.muscle] ?? 0) + row.hardSets;
  }
  return out;
}

/** §5.2 OVER-WORKED comparison substrate — trailing volume by muscle over `windowDays` (the
 *  engine's own recovery window is the natural default; callers pass whatever the rule needs). */
export function trailingVolumeByMuscle(
  db: Db,
  today: string,
  windowDays: number,
): Record<string, number> {
  const cutoff = isWithinRollingWindowCutoff(today, windowDays);
  const rows = db
    .select()
    .from(schema.sessionMuscleVolume)
    .where(gte(schema.sessionMuscleVolume.localDate, cutoff))
    .all();
  const out: Record<string, number> = {};
  for (const row of rows) out[row.muscle] = (out[row.muscle] ?? 0) + row.sets;
  return out;
}

function isWithinRollingWindowCutoff(today: string, windowDays: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d - (windowDays - 1)));
  return `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}-${String(cutoff.getUTCDate()).padStart(2, '0')}`;
}
