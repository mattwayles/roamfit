/**
 * The Logbook's days for a month other than the current one. The current month already rides on
 * `useDashboardData` (so Today and Journey share one read); paging back only needs this small extra
 * read: the month's completed sessions (uncapped, by `local_date` range), plus the same travel
 * signals and hand-set markers the dashboard uses. Derived with `useMemo` from the dashboard's
 * `data`, so a marker set or a reload (which replaces `data`) re-reads it with no extra plumbing.
 */
import { useMemo } from 'react';
import { manualDayMarkersRepo, sessionsRepo, signalsRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { buildCalendarDays, monthWindow, type CalendarDay } from './dashboard';
import type { DashboardData } from './useDashboardData';

/** `null` while `viewedMonth` is the current month (or data hasn't loaded) — the caller then uses
 *  `data.calendarDays`. */
export function useLogbookMonth(
  viewedMonth: string,
  data: DashboardData | undefined,
): CalendarDay[] | null {
  const { db } = useStore();
  return useMemo(() => {
    if (!data || viewedMonth === data.todayLocalDate.slice(0, 7)) return null;
    const window = monthWindow(`${viewedMonth}-01`);
    const sessions = sessionsRepo.getCompletedSessionsInRange(db, window.from, window.to);
    const travel = new Set(
      signalsRepo.getSignalEventsByType(db, 'travel_day').map((e) => e.localDate),
    );
    return buildCalendarDays(
      sessions,
      data.todayLocalDate,
      travel,
      manualDayMarkersRepo.getManualDayMarkers(db),
      window,
    );
  }, [db, viewedMonth, data]);
}
