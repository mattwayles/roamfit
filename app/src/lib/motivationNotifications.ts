/**
 * Daily motivational push notifications — a request-driven feature (see CLAUDE.md: this app is
 * now driven by user feedback, not the deleted spec). Requirements, verbatim from the request:
 * a large pool of varied messages randomly picked each day (not the same nudge every time); skip
 * the day entirely once a workout is already done or the day is marked "in transit"; a Settings
 * on/off switch; a user-chosen count of notifications per day, each at a user-chosen time; and
 * every one of those times still respects the existing quiet-hours setting.
 *
 * This supersedes the earlier "seven fixed weekday triggers, one adaptive nudge + a Sunday
 * summary" design (STATUS-5-motivation.md) — that scheme had no user-facing count/time controls
 * and no per-day skip, both now explicitly requested. The weekly-summary/streak copy isn't gone,
 * it's folded into the pool (`motivationMessages.ts`'s `streak-*` templates) since there's no
 * more "always Sunday" slot once times are user-chosen.
 *
 * **Honest limitation, same shape as the backlog's existing "sync trigger is weak" note**: local
 * notifications can't run app code at delivery time, so "already done today"/"in transit today"
 * can only be evaluated at *schedule* time, not fire time. This module schedules a rolling
 * `SCHEDULE_WINDOW_DAYS`-day window of one-shot notifications and gets re-run opportunistically
 * (on every Home focus, and therefore also right after marking a travel day or finishing a
 * session, both of which return to Home) — see `HomeScreen.tsx`'s `load()`. If the app genuinely
 * isn't opened for that many days, the tail of the window can fire on a day the user already
 * trained; there is no background task in this app to correct that without a reopen.
 */
import * as Notifications from 'expo-notifications';
import { addDays, createRng, seedFromString } from '@roamfit/engine';
import { buildMotivationPool, pickDailyMessages } from './motivationMessages';
import type { MotivationContext } from './motivationMessages';

const IDENTIFIER_PREFIX = 'motivation-slot-';
const QUIET_HOURS_START = 22; // 10pm
const QUIET_HOURS_END = 7; // 7am
/** How many days ahead to keep scheduled — see the module doc's "honest limitation." */
const SCHEDULE_WINDOW_DAYS = 7;
/** Hard ceiling on notifications/day, enforced in Settings too — keeps the scheduled total well
 *  under iOS's ~64-pending-notification budget even at the full 7-day window. */
export const MAX_DAILY_MOTIVATION_TIMES = 5;

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

/** A "HH:MM" local time, clamped out of the 10pm-7am quiet window when it's enabled. Moved to
 *  the window's own end (a gentle morning default), never silently dropped — matches the
 *  original single-nudge behavior's rule, just applied per user-chosen time instead of once. */
export function clampToQuietHours(time: string, enabled = true): string {
  const [hour, minute] = parseTime(time);
  if (!enabled) return time;
  const inQuiet =
    QUIET_HOURS_START > QUIET_HOURS_END
      ? hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END
      : hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
  return inQuiet ? formatTime(QUIET_HOURS_END, 0) : formatTime(hour, minute);
}

function parseTime(time: string): [number, number] {
  const [h, m] = time.split(':').map((n) => Number(n));
  return [Number.isFinite(h) ? h : 18, Number.isFinite(m) ? m : 0];
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Settings' time-of-day stepper — a plain +/- N minutes on a "HH:MM" string, wrapping around
 *  midnight. No new date-picker dependency (none is installed, see backlog's native-wheel-picker
 *  item) — a stepper is enough for a handful of daily times and needs no native rebuild. */
export function shiftTime(time: string, deltaMinutes: number): string {
  const [h, m] = parseTime(time);
  const minutesPerDay = 24 * 60;
  let total = (h * 60 + m + deltaMinutes) % minutesPerDay;
  if (total < 0) total += minutesPerDay;
  return formatTime(Math.floor(total / 60), total % 60);
}

export interface ScheduleMotivationNotificationsInput {
  /** Off cancels everything scheduled and schedules nothing new. */
  motivationEnabled: boolean;
  /** "HH:MM" 24-hour local times — one notification/day per entry. Empty = none scheduled. */
  motivationTimes: string[];
  quietHoursEnabled: boolean;
  motivationContext: MotivationContext;
  /** Today's local date (`YYYY-MM-DD`), for both the schedule window's start and the daily rng
   *  seed — same date format used everywhere else in the store (invariant 6). */
  todayLocalDate: string;
  /** Today already has a completed session, or is marked "in transit" — skip today's slots
   *  entirely (both explicitly requested). Days after today are scheduled regardless, since
   *  tomorrow's state isn't knowable yet — see the module doc. */
  skipToday: boolean;
  /** Injected so tests don't depend on real wall-clock time; defaults to `new Date()`. */
  now?: Date;
}

/** Re-derives the full rolling window and replaces every previously-scheduled identifier. Safe
 *  to call on every Home open (matches the app's existing opportunistic-refresh pattern, e.g.
 *  `runOpportunisticSync`) — cancel+reschedule by fixed identifier never accumulates. */
export async function scheduleMotivationNotifications(
  input: ScheduleMotivationNotificationsInput,
): Promise<void> {
  const times = input.motivationTimes.slice(0, MAX_DAILY_MOTIVATION_TIMES);

  // Cancel the widest window this module could ever have scheduled, regardless of today's
  // slot count — a lower count than last time must not leave orphaned notifications behind.
  for (let dayOffset = 0; dayOffset < SCHEDULE_WINDOW_DAYS; dayOffset += 1) {
    for (let slot = 0; slot < MAX_DAILY_MOTIVATION_TIMES; slot += 1) {
      try {
        await Notifications.cancelScheduledNotificationAsync(
          `${IDENTIFIER_PREFIX}${dayOffset}-${slot}`,
        );
      } catch {
        // Nothing scheduled at that identifier yet — fine.
      }
    }
  }

  if (!input.motivationEnabled || times.length === 0) return;

  const now = input.now ?? new Date();
  const pool = buildMotivationPool(input.motivationContext);

  for (let dayOffset = 0; dayOffset < SCHEDULE_WINDOW_DAYS; dayOffset += 1) {
    if (dayOffset === 0 && input.skipToday) continue;

    const dateLabel = addDays(input.todayLocalDate, dayOffset);
    const rng = createRng(seedFromString(`motivation-${dateLabel}`));
    const messages = pickDailyMessages(pool, times.length, rng);

    for (let slot = 0; slot < times.length; slot += 1) {
      const clamped = clampToQuietHours(times[slot], input.quietHoursEnabled);
      const [hour, minute] = parseTime(clamped);
      const fireAt = dateForLocalTime(input.todayLocalDate, dayOffset, hour, minute);
      if (fireAt.getTime() <= now.getTime()) continue; // already passed — today's slot only

      const message = messages[slot];
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: `${IDENTIFIER_PREFIX}${dayOffset}-${slot}`,
          content: { title: message.title, body: message.body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
        });
      } catch {
        // Best-effort — denied permission or no native module must never block the app.
      }
    }
  }
}

/** `todayLocalDate` + `dayOffset` days, at `hour:minute` *local to this device* — local
 *  notifications fire in the device's own timezone, so building the trigger `Date` from the
 *  device's local components (not a UTC-parsed instant, invariant 6's app-layer counterpart) is
 *  the correct thing here, unlike persisted session timestamps. */
function dateForLocalTime(
  todayLocalDate: string,
  dayOffset: number,
  hour: number,
  minute: number,
): Date {
  const [y, m, d] = todayLocalDate.split('-').map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1, hour, minute, 0, 0);
  base.setDate(base.getDate() + dayOffset);
  return base;
}
