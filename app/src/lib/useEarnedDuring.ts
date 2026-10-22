/** The finished workout a badge was earned in, as a history view, or null (no session, or the
 *  workout is no longer on file). Shared by the badge sheet and the Timeline. */
import { useMemo } from 'react';
import { sessionsRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { buildSessionHistoryView } from './sessionHistory';
import type { ShelfBadge } from './badges';

export function useEarnedDuring(badge: ShelfBadge) {
  const { db, library } = useStore();
  const sessionId = badge.earned && !badge.retroactive ? badge.sessionId : null;
  return useMemo(() => {
    if (!sessionId) return null;
    const session = sessionsRepo.getCompletedSessionDetail(db, sessionId);
    return session ? buildSessionHistoryView(session, library.exercises) : null;
  }, [db, library, sessionId]);
}
