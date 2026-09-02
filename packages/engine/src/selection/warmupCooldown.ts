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
  /**
   * Exclude these ids too, on top of the light-rotation exclusion. Two sources, both required
   * now that a library record can be eligible for more than one section: the group loop's own
   * picks so far (no repeats within one warm-up), and everything the session has already
   * committed to elsewhere — nobody wants "Band Row" as their warm-up *and* their main work, or a
   * cat-cow at both ends of the session.
   */
  excludeIds?: ReadonlySet<string>;
}

export function selectWarmupCooldown(input: SelectWarmupCooldownInput): Exercise | null {
  const { role, pool, focus, userState, today, rng, excludeIds } = input;
  const ctx = { history: userState.history, exerciseStates: userState.exerciseStates, today };
  const focusPool = pool.filter((e) => e.roles.includes(role) && e.focus.includes(focus));
  const basePoolAll = focusPool.length > 0 ? focusPool : pool.filter((e) => e.roles.includes(role));
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
/** Stop fetching another candidate once at least this fraction of the target is already banked
 *  — warmup/cooldown are minor components (a few minutes each), so landing a bit under is far
 *  cheaper than the old behavior of routinely adding one exercise past the budgeted minutes
 *  (confirmed the largest single contributor to the round-1 fix's residual overruns: the old stop
 *  check ran *after* fetching one more candidate instead of before, so wu=4 against a 3-minute/
 *  180s budget — ~4x54s=216s already past target — was normal, not exceptional). */
const GROUP_FLOOR_RATIO = 0.7;
/** Never accept a candidate that would push the running total past this multiple of target. */
const GROUP_CEILING_RATIO = 1.3;

export function selectWarmupCooldownGroup(
  input: SelectWarmupCooldownInput & { targetSec: number },
): Exercise[] {
  const chosen: Exercise[] = [];
  // Seeded with whatever the caller already excluded (the session's other sections) rather than
  // starting empty and overwriting `input.excludeIds` on each inner call — that would have
  // silently dropped the caller's exclusions the moment this loop began.
  const usedIds = new Set<string>(input.excludeIds ?? []);
  let totalSec = 0;
  const floor = input.targetSec * GROUP_FLOOR_RATIO;
  const ceiling = input.targetSec * GROUP_CEILING_RATIO;
  for (let i = 0; i < WARMUP_COOLDOWN_GROUP_MAX; i++) {
    // Check BEFORE fetching another candidate — already close enough, stop here. (Checking only
    // after fetching one more, as the previous version did, is what produced the systematic
    // one-exercise-too-many overrun.)
    if (totalSec >= floor) break;
    const pick = selectWarmupCooldown({ ...input, excludeIds: usedIds });
    if (!pick) break;
    const entrySec = prescribeWarmupCooldown(pick, input.role).estimatedSec;
    // Always take at least one, even if it alone exceeds the ceiling (a single warmup movement
    // longer than the budget is still better than none) — only reject the *next* one on that basis.
    if (totalSec > 0 && totalSec + entrySec > ceiling) break;
    chosen.push(pick);
    usedIds.add(pick.id);
    totalSec += entrySec;
  }
  return chosen;
}
