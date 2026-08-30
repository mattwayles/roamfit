/**
 * Warmup/cooldown selection — light rotation per docs/decisions/0001-blocked-scope.md, not the
 * full BLOCKED/PREFERRED machinery (the 9-warmup/12-cooldown pool would exhaust it). Still
 * respects enjoyment-avoidance (≤2) and REPEATEDLY-SKIPPED suppression, since both are
 * per-exercise-state facts independent of pool size.
 */
import type { Exercise, Focus, Role } from '@roamfit/data';
import type { Rng, UserState, LocalDate } from '../types';
import { buildCandidates } from './candidates';
import { rngIndex } from '../rng';
import { AVOID_ENJOYMENT_MAX, WARMUP_COOLDOWN_ROTATION_SESSIONS } from './constants';

export interface SelectWarmupCooldownInput {
  role: Extract<Role, 'warmup' | 'cooldown'>;
  pool: readonly Exercise[]; // hard-filtered
  focus: Focus;
  userState: UserState;
  today: LocalDate;
  rng: Rng;
}

export function selectWarmupCooldown(input: SelectWarmupCooldownInput): Exercise | null {
  const { role, pool, focus, userState, today, rng } = input;
  const ctx = { history: userState.history, exerciseStates: userState.exerciseStates, today };
  const focusPool = pool.filter((e) => e.role === role && e.focus.includes(focus));
  const basePool = focusPool.length > 0 ? focusPool : pool.filter((e) => e.role === role);
  if (basePool.length === 0) return null;

  const candidates = buildCandidates(basePool, role, ctx).filter((c) => !c.isSuppressed);
  if (candidates.length === 0) return null;

  // Exclude only the immediately-previous pick for this role — drop the exclusion if it would
  // leave nothing (ADR 0001).
  const rotated = candidates.filter(
    (c) => c.sessionsAgo === null || c.sessionsAgo > WARMUP_COOLDOWN_ROTATION_SESSIONS,
  );
  const pickFrom = rotated.length > 0 ? rotated : candidates;

  // Avoid ≤2 enjoyment unless it's the only option.
  const liked = pickFrom.filter((c) => c.enjoyment > AVOID_ENJOYMENT_MAX);
  const finalPool = liked.length > 0 ? liked : pickFrom;

  return finalPool[rngIndex(rng, finalPool.length)].exercise;
}
