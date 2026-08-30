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
import { prescribeWarmupCooldown } from '../prescription/prescribe';

export interface SelectWarmupCooldownInput {
  role: Extract<Role, 'warmup' | 'cooldown'>;
  pool: readonly Exercise[]; // hard-filtered
  focus: Focus;
  userState: UserState;
  today: LocalDate;
  rng: Rng;
  /** Exclude these ids too (already picked earlier this session), on top of the light-rotation
   *  exclusion — used by `selectWarmupCooldownGroup` to avoid repeating a pick within one call. */
  excludeIds?: ReadonlySet<string>;
}

export function selectWarmupCooldown(input: SelectWarmupCooldownInput): Exercise | null {
  const { role, pool, focus, userState, today, rng, excludeIds } = input;
  const ctx = { history: userState.history, exerciseStates: userState.exerciseStates, today };
  const focusPool = pool.filter((e) => e.role === role && e.focus.includes(focus));
  const basePoolAll = focusPool.length > 0 ? focusPool : pool.filter((e) => e.role === role);
  const basePool = excludeIds ? basePoolAll.filter((e) => !excludeIds.has(e.id)) : basePoolAll;
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

/**
 * §5.6 allocates several *minutes* to warmup/cooldown (`clamp(round(0.12xT),3,8)` /
 * `clamp(round(0.10xT),3,7)`) — far more than a single ~45-90s movement fills. For a full
 * (non-Quick-Session) generation, pick as many distinct warmup/cooldown exercises as it takes to
 * approximately fill that allocation, so the budgeted minutes are actually spent rather than
 * silently left on the table (the single biggest contributor to the §5.6 shortfall this fixes —
 * see STATUS-2-engine.md). §9.5 Quick Session explicitly wants exactly one of each and does not
 * call this — it keeps calling `selectWarmupCooldown` once.
 */
const WARMUP_COOLDOWN_GROUP_MAX = 4;

export function selectWarmupCooldownGroup(
  input: SelectWarmupCooldownInput & { targetSec: number },
): Exercise[] {
  const chosen: Exercise[] = [];
  const usedIds = new Set<string>();
  let totalSec = 0;
  for (let i = 0; i < WARMUP_COOLDOWN_GROUP_MAX; i++) {
    const pick = selectWarmupCooldown({ ...input, excludeIds: usedIds });
    if (!pick) break;
    const entrySec = prescribeWarmupCooldown(pick, input.role).estimatedSec;
    // Stop once we've met the target, or once one more pick would badly overshoot it — but
    // always take at least one (handled by the loop simply running once already).
    if (totalSec > 0 && totalSec >= input.targetSec) break;
    if (totalSec > 0 && totalSec + entrySec > input.targetSec * 1.4) break;
    chosen.push(pick);
    usedIds.add(pick.id);
    totalSec += entrySec;
  }
  return chosen;
}
