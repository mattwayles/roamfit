/**
 * §9.8 notifications — adaptive to the *observed* training window, max one per day, quiet hours,
 * device tz, never guilt-based (loss-aversion framing preferred), Sunday weekly summary.
 *
 * Architecture for "max one per day": rather than one repeating daily notification with content
 * fixed forever at schedule time, this schedules **seven** weekday-scoped local notifications
 * (identifiers `motivation-nudge-0..6`, 0=Sunday) via `expo-notifications`' calendar trigger
 * (`{ weekday, hour, minute, repeats: true }`) — exactly one per calendar day, which is what
 * makes "max one per day" a structural property instead of a rule the caller has to remember.
 * Sunday's carries the weekly-summary copy; the other six carry the adaptive loss-aversion nudge.
 * `scheduleMotivationNotifications` re-schedules all seven every time it's called (cheap,
 * idempotent via fixed identifiers — a re-schedule replaces, never accumulates), so content stays
 * reasonably fresh across app opens without needing a background task.
 *
 * `expo-notifications` imports and calls cleanly under Jest (see `workoutNotifications.ts`'s
 * header — already established in Wave 4b) so no lazy-loader guard is needed here, but exactly
 * like that file, nothing here can prove a notification actually appears on a real device; that
 * is unverified-in-Jest and recorded honestly in STATUS-5-motivation.md.
 */
import * as Notifications from 'expo-notifications';
import type { sessionsRepo, statsRepo } from '@roamfit/store';
import type { NextUnlockHero } from './dashboard';

const IDENTIFIER_PREFIX = 'motivation-nudge-';
const QUIET_HOURS_START = 22; // 10pm
const QUIET_HOURS_END = 7; // 7am
const DEFAULT_HOUR = 18; // 6pm — used when there isn't yet an observed training window
const WEEKLY_SUMMARY_HOUR = 18;
const SUNDAY = 0;

/** The local hour-of-day (0-23) each session actually started in, using that *session's own*
 *  `tzId` (§12invariant 6's sibling rule for time-of-day) — not the device's current timezone,
 *  which would misrepresent a traveler's history. */
export function sessionLocalHours(startTimes: sessionsRepo.SessionStartTime[]): number[] {
  return startTimes
    .map(({ startedAt, tzId }) => {
      try {
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone: tzId,
          hour: 'numeric',
          hour12: false,
        }).format(new Date(startedAt));
        const hour = Number(formatted.replace(/[^\d]/g, ''));
        return Number.isFinite(hour) ? hour % 24 : null;
      } catch {
        return null;
      }
    })
    .filter((h): h is number => h !== null);
}

/** The single most common training hour, or `null` with too little history to say anything
 *  (the caller falls back to a neutral default rather than guessing). */
export function observedTrainingHour(hours: number[]): number | null {
  if (hours.length === 0) return null;
  const counts = new Map<number, number>();
  for (const h of hours) counts.set(h, (counts.get(h) ?? 0) + 1);
  let best = hours[0];
  let bestCount = 0;
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      best = hour;
      bestCount = count;
    }
  }
  return best;
}

/** Quiet hours (§9.8) — a fixed 10pm-7am default (no settings screen to make this user-editable
 *  yet, noted as a scope simplification in STATUS-5-motivation.md). An hour inside the window is
 *  moved to the window's own end (a gentle morning default), never silently dropped — the user
 *  still gets exactly one notification that day, just not at 3am. */
export function clampToQuietHours(hour: number): number {
  const inQuiet =
    QUIET_HOURS_START > QUIET_HOURS_END
      ? hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END
      : hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
  return inQuiet ? QUIET_HOURS_END : hour;
}

/** §9.8 — loss-aversion framing, never guilt. Prefers a concrete Next Unlock line (the example
 *  the spec itself gives); falls back to a still-positive, still-not-guilt generic line when
 *  there's no board data yet (shouldn't happen once `hasEverCompletedSession`, but defensive). */
export function buildDailyNudgeText(hero: NextUnlockHero | null): { title: string; body: string } {
  if (hero) {
    return {
      title: 'RoamFit',
      body: `${hero.sessionsRemaining} ${hero.sessionsRemaining === 1 ? 'session' : 'sessions'} from ${hero.nextExerciseName}.`,
    };
  }
  return { title: 'RoamFit', body: 'Your next session is ready whenever you are.' };
}

/** §9.8 Sunday weekly summary — also the §9.10 recap-card source text (a share card is just this
 *  same string rendered, per the "no new backend" rule). */
export function buildWeeklySummaryText(
  stats: statsRepo.RolledUpStatsRecord,
  rollingCount: number,
  weeklyTarget: number,
): { title: string; body: string } {
  return {
    title: 'Your week',
    body: `${rollingCount} of ${weeklyTarget} sessions this week${
      stats.weekStreak > 0 ? ` · ${stats.weekStreak} week streak` : ''
    }.`,
  };
}

let permissionRequested = false;

export async function ensureNotificationPermission(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'granted') await Notifications.requestPermissionsAsync();
  } catch {
    // Best-effort — a denied/unavailable permission must never block the rest of the app.
  }
}

export interface ScheduleMotivationNotificationsInput {
  startTimes: sessionsRepo.SessionStartTime[];
  hero: NextUnlockHero | null;
  stats: statsRepo.RolledUpStatsRecord;
  rollingCount: number;
  weeklyTarget: number;
}

/** Re-schedules all seven weekday notifications. Safe to call on every app open once the user
 *  has ever completed a session — cancels+replaces by fixed identifier, never accumulates. */
export async function scheduleMotivationNotifications(
  input: ScheduleMotivationNotificationsInput,
): Promise<void> {
  const observedHour = observedTrainingHour(sessionLocalHours(input.startTimes));
  const nudgeHour = clampToQuietHours(observedHour ?? DEFAULT_HOUR);
  const nudge = buildDailyNudgeText(input.hero);
  const summary = buildWeeklySummaryText(input.stats, input.rollingCount, input.weeklyTarget);

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const identifier = `${IDENTIFIER_PREFIX}${weekday}`;
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      // Nothing scheduled yet — fine.
    }
    const isSunday = weekday === SUNDAY;
    const content = isSunday ? summary : nudge;
    const hour = isSunday ? WEEKLY_SUMMARY_HOUR : nudgeHour;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: content.title, body: content.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: weekday + 1, // expo-notifications: 1=Sunday..7=Saturday
          hour,
          minute: 0,
        },
      });
    } catch {
      // Best-effort — denied permission or no native module must never block the app.
    }
  }
}
