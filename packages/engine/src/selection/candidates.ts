/**
 * Derived per-exercise facts (§5.2) computed from `UserState.history` + `exerciseStates`.
 * Pure functions over the history the caller supplies — no ambient clock, no I/O.
 */
import type { Exercise, Role } from '@roamfit/data';
import { daysBetween } from '../dates';
import { HARD_COOLDOWN_SESSIONS, SOFT_COOLDOWN_SESSIONS } from './constants';
import type { CooldownWindows } from '../preferences';
import type {
  Candidate,
  ExerciseState,
  LocalDate,
  RecencyTier,
  SessionHistoryRecord,
} from '../types';

/** How many sessions back (1 = most recent) this exercise last appeared at the given role.
 *  `null` if it never has. Discarded sessions never happened, so they don't count. */
export function sessionsAgo(
  history: readonly SessionHistoryRecord[],
  exerciseId: string,
  role: Role,
): number | null {
  const eligible = history.filter((s) => s.status !== 'discarded');
  for (let i = eligible.length - 1, back = 1; i >= 0; i--, back++) {
    if (eligible[i].entries.some((e) => e.exerciseId === exerciseId && e.role === role)) {
      return back;
    }
  }
  return null;
}

const DEFAULT_COOLDOWNS: CooldownWindows = {
  hard: HARD_COOLDOWN_SESSIONS,
  soft: SOFT_COOLDOWN_SESSIONS,
};

/** `windows` — the user's variety preference (`cooldownWindowsFor`); default = the §5.2 rule. */
export function recencyTier(
  ago: number | null,
  windows: CooldownWindows = DEFAULT_COOLDOWNS,
): RecencyTier {
  if (ago !== null && ago <= windows.hard) return 'blocked';
  if (ago !== null && ago <= windows.soft) return 'soft';
  return 'preferred';
}

function isSuppressed(state: ExerciseState | undefined, today: LocalDate): boolean {
  if (!state?.suppressedUntil) return false;
  return daysBetween(today, state.suppressedUntil) >= 0;
}

export interface CandidateContext {
  history: readonly SessionHistoryRecord[];
  exerciseStates: Readonly<Record<string, ExerciseState>>;
  today: LocalDate;
  /** Track 37f — variety preference; omitted = the §5.2 windows. */
  cooldowns?: CooldownWindows;
}

export function buildCandidate(exercise: Exercise, role: Role, ctx: CandidateContext): Candidate {
  const state = ctx.exerciseStates[exercise.id];
  const ago = sessionsAgo(ctx.history, exercise.id, role);
  const performCount = state?.sessionsPerformed ?? 0;
  return {
    exercise,
    sessionsAgo: ago,
    tier: recencyTier(ago, ctx.cooldowns),
    performCount,
    isNovel: performCount === 0,
    isSuppressed: isSuppressed(state, ctx.today),
  };
}

export function buildCandidates(
  pool: readonly Exercise[],
  role: Role,
  ctx: CandidateContext,
): Candidate[] {
  return pool.filter((e) => e.roles.includes(role)).map((e) => buildCandidate(e, role, ctx));
}

/** §5.2 REPEATEDLY-SKIPPED — an exercise skipped or swapped away twice+ is suppressed for 30
 *  days. This just checks the count; `ExerciseState.suppressedUntil` (set by the caller when the
 *  threshold is crossed, e.g. at session completion) is what `isSuppressed` above reads. Exposed
 *  so callers (Wave 3, on session completion) know when to set it and fire the one-time notice. */
export function shouldSuppressForRepeatedSkip(state: ExerciseState, threshold: number): boolean {
  return state.skipCount + state.swapAwayCount >= threshold;
}
