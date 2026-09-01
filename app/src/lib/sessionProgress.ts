/**
 * §10.8 crash-safety resume rule, factored out of `WorkoutScreen.tsx` so it can also drive the
 * §8.3 "abandoned, and at exactly which exercise" signal from other screens (Home, Approval)
 * that offer an abandon action but don't otherwise need the full active-workout UI. Pure — reads
 * only an already-loaded `SessionRecord`, no I/O, so it's safe to call from anywhere that already
 * has one in hand.
 */
import type { sessionsRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';

export function activeEntries(session: SessionRecord): sessionsRepo.SessionEntryRecord[] {
  return session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
}

/** The first not-yet-fully-logged (entry, setIndex) pair, in plan order — the entire
 *  crash-safety resume rule: reconstructed purely from `set_logs` rows on every read, no
 *  separate cursor to go stale. `null` if the whole plan is already logged (session is either
 *  complete or has nothing left to run). */
export function findCurrentEntry(
  session: SessionRecord,
): { entry: sessionsRepo.SessionEntryRecord; setIndex: number } | null {
  for (const entry of activeEntries(session)) {
    if (entry.setLogs.length < entry.sets) {
      return { entry, setIndex: entry.setLogs.length };
    }
  }
  return null;
}
