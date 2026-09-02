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

/** A single (entry, set) slot in the plan. Identified by `entryId` rather than by index so it
 *  survives a reload, a swap, or anything else that rebuilds the entry objects. */
export interface SessionPosition {
  entryId: string;
  setIndex: number;
}

/** Every (entry, set) slot the workout contains, in plan order — the sequence the two set-nav
 *  controls step along. Removed-at-approval entries are not in it, so stepping never lands on an
 *  exercise the user already took out of the plan. */
export function positionsInOrder(session: SessionRecord): SessionPosition[] {
  const positions: SessionPosition[] = [];
  for (const entry of activeEntries(session)) {
    for (let i = 0; i < entry.sets; i++) positions.push({ entryId: entry.id, setIndex: i });
  }
  return positions;
}

export function samePosition(a: SessionPosition | null, b: SessionPosition | null): boolean {
  if (a === null || b === null) return a === b;
  return a.entryId === b.entryId && a.setIndex === b.setIndex;
}

/** The slot one step before (`-1`) or after (`+1`) `from`, or null at either end of the plan —
 *  crossing an exercise boundary on the way, so stepping back from set 1 of an exercise lands on
 *  the last set of the previous one. Pure position arithmetic: it logs nothing and deletes
 *  nothing, which is what lets the user move around the workout without altering it. */
export function stepPosition(
  session: SessionRecord,
  from: SessionPosition,
  delta: 1 | -1,
): SessionPosition | null {
  const positions = positionsInOrder(session);
  const index = positions.findIndex((p) => samePosition(p, from));
  if (index === -1) return null;
  return positions[index + delta] ?? null;
}

export type Section = 'warmup' | 'main' | 'cooldown';

/**
 * The §10.3 stage `position` belongs to, but only if logging it *finishes* that stage — every
 * other slot the stage owns is already logged. `null` otherwise.
 *
 * This is what the warm-up and cool-down feedback pages hang off: one question per stage, asked
 * at the moment the stage ends, instead of one per exercise inside it.
 *
 * Computed against the session as it stands *plus* the log about to be written, so a caller can
 * decide where to go next before its `reload()` lands. Set membership, not a count: a set the user
 * stepped back to and re-logged upserts its row rather than adding one, so counting would say the
 * stage still had a slot left when it does not.
 */
export function completesSection(
  session: SessionRecord,
  position: SessionPosition,
): Section | null {
  const entries = activeEntries(session);
  const target = entries.find((e) => e.id === position.entryId);
  if (!target) return null;
  const section = target.section;
  for (const entry of entries) {
    if (entry.section !== section) continue;
    const logged = new Set(entry.setLogs.map((l) => l.setIndex));
    if (entry.id === target.id) logged.add(position.setIndex);
    for (let i = 0; i < entry.sets; i++) {
      if (!logged.has(i)) return null;
    }
  }
  return section;
}

/** Whether any set in `section` has actually been trained, as opposed to skipped past. A stage
 *  nobody did is a stage there is nothing to ask about. */
export function sectionHasCompletedSet(session: SessionRecord, section: Section): boolean {
  return activeEntries(session).some(
    (e) => e.section === section && e.setLogs.some((l) => l.status === 'completed'),
  );
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
