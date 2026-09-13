/**
 * Quick Session's focus/difficulty picks — which focus and difficulty the Home screen's Quick
 * Session button requests, derived from recent history rather than hardcoded. Kept out of
 * `HomeScreen.tsx` so that file stays about rendering, and out of `packages/engine` because this
 * is a caller-side convenience pick, not a generation rule (invariant 2: the engine decides what
 * goes in the session once focus/difficulty are chosen, it does not choose them).
 */
import type { Difficulty, Focus } from '@roamfit/data';
import type { SessionHistoryRecord } from '@roamfit/engine';

const ALL_FOCI: readonly Focus[] = ['full', 'upper', 'abs', 'legs'];

/** The focus trained least often in recent history, ties broken by whichever has gone longest
 *  without being trained at all (most useful when every count is 0 or 1, the common case for a
 *  new or lightly-used account). Counts every recorded session regardless of `status` — a
 *  discarded or partial session is still evidence the user was aiming at that focus recently, the
 *  same "what did the user recently show interest in" reading `accessoryRotationOffset` already
 *  uses elsewhere in the engine. Defaults to `'full'` (Quick Session's long-standing default) when
 *  there's no history to read at all. */
export function pickQuickSessionFocus(history: readonly SessionHistoryRecord[]): Focus {
  if (history.length === 0) return 'full';

  const counts: Record<Focus, number> = { full: 0, upper: 0, abs: 0, legs: 0 };
  const lastSeenIndex: Record<Focus, number> = { full: -1, upper: -1, abs: -1, legs: -1 };
  history.forEach((session, i) => {
    counts[session.focus] += 1;
    lastSeenIndex[session.focus] = i;
  });

  let best: Focus = ALL_FOCI[0];
  for (const focus of ALL_FOCI.slice(1)) {
    if (
      counts[focus] < counts[best] ||
      (counts[focus] === counts[best] && lastSeenIndex[focus] < lastSeenIndex[best])
    ) {
      best = focus;
    }
  }
  return best;
}

/** The difficulty of the most recent *completed* session at the given focus — "last time you did
 *  an Abs workout you finished it at Hard, so Quick Session offers Hard again." Only `completed`
 *  sessions count: a `partial` or `discarded` session's recorded difficulty was the target, not a
 *  difficulty the user actually finished at, so it's not "adequate historical data" for this pick.
 *  Defaults to `'medium'` when there's no completed session at this focus yet. */
export function pickQuickSessionDifficulty(
  history: readonly SessionHistoryRecord[],
  focus: Focus,
): Difficulty {
  for (let i = history.length - 1; i >= 0; i--) {
    const session = history[i];
    if (session.focus === focus && session.status === 'completed') return session.difficulty;
  }
  return 'medium';
}
