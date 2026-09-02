/**
 * §5.1 step 2 / §5.5 — fill the focus template's pattern slots, in priority order. Selection
 * (step 3) fills each slot from the eligible pool; time fit (step 6) trims from the tail of the
 * (already priority-ordered) slot list when the budget is tight, and appends optional slots when
 * there's room. Required slots are never dropped by time fit — if a required pattern truly has
 * no eligible exercise, that's a PATTERN GAP (§5.2), not a silently shorter template.
 */
import type { Exercise, Focus, Pattern } from '@roamfit/data';
import type { Effort, SessionHistoryRecord } from '../types';

export interface TemplateSlot {
  id: string;
  /** Candidate patterns for this slot, in preference order. Selection tries them in order. */
  patterns: Pattern[];
  required: boolean;
  /** A conditioning finisher slot draws from `tier: fill` regardless of pattern match quality
   *  (carried-forward issue #5 — finishers are tagged `fill` with a primary-mover pattern). */
  isFinisher?: boolean;
}

export interface FocusTemplateResult {
  slots: TemplateSlot[];
  /** For abs — which pattern led this session, so history can rotate it next time. */
  leadPattern?: Pattern;
}

const UPPER_ISOLATION: Pattern[] = ['elbow_flexion', 'elbow_extension', 'shoulder_isolation'];
const ABS_PATTERNS: Pattern[] = ['anti_rotation', 'flexion', 'anti_extension', 'lateral_flexion'];

/** Pattern of the most recent main-role exercise in the most recent session matching `focus`
 *  whose pattern is in `candidates`. Used to alternate a template choice session to session.
 *
 *  ADR 0011 — this is a "what did the generator last *show* me" question, so **discarded sessions
 *  count**. Abandoning is the strongest negative signal there is; answering it with the same
 *  template again is the bug this fixes. Contrast `sessionsAgo` and the volume helpers, which ask
 *  what the user actually *trained* and must stay blind to abandoned sessions. */
function lastChosenPattern(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  focus: Focus,
  candidates: readonly Pattern[],
): Pattern | undefined {
  const byId = new Map(library.map((e) => [e.id, e]));
  for (let i = history.length - 1; i >= 0; i--) {
    const session = history[i];
    if (session.focus !== focus) continue;
    for (const entry of session.entries) {
      if (entry.role !== 'main') continue;
      const ex = byId.get(entry.exerciseId);
      if (ex && candidates.includes(ex.pattern)) return ex.pattern;
    }
  }
  return undefined;
}

/** The pattern to use *this* session, alternating away from whatever was used last time. */
function alternate(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  focus: Focus,
  candidates: readonly Pattern[],
): Pattern {
  const last = lastChosenPattern(history, library, focus, candidates);
  if (!last) return candidates[0];
  const idx = candidates.indexOf(last);
  return candidates[(idx + 1) % candidates.length];
}

function upperSlots(
  targetMinutes: number,
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
): TemplateSlot[] {
  if (targetMinutes < 25) {
    const vertical = alternate(history, library, 'upper', ['vertical_push', 'vertical_pull']);
    const isolation = alternate(history, library, 'upper', UPPER_ISOLATION);
    return [
      { id: 'upper.horizontal_push', patterns: ['horizontal_push'], required: true },
      { id: 'upper.horizontal_pull', patterns: ['horizontal_pull'], required: true },
      { id: 'upper.vertical', patterns: [vertical], required: true },
      { id: 'upper.isolation', patterns: [isolation], required: false },
    ];
  }
  return [
    { id: 'upper.horizontal_push', patterns: ['horizontal_push'], required: true },
    { id: 'upper.horizontal_pull', patterns: ['horizontal_pull'], required: true },
    { id: 'upper.vertical_push', patterns: ['vertical_push'], required: true },
    { id: 'upper.vertical_pull', patterns: ['vertical_pull'], required: true },
    { id: 'upper.isolation_1', patterns: [UPPER_ISOLATION[0]], required: false },
    { id: 'upper.isolation_2', patterns: [UPPER_ISOLATION[1]], required: false },
    { id: 'upper.isolation_3', patterns: [UPPER_ISOLATION[2]], required: false },
  ];
}

function legsSlots(): TemplateSlot[] {
  return [
    { id: 'legs.squat', patterns: ['squat'], required: true },
    { id: 'legs.hinge', patterns: ['hinge'], required: true },
    { id: 'legs.unilateral', patterns: ['lunge'], required: true },
    { id: 'legs.isolation', patterns: ['abduction', 'hip_extension'], required: false },
    { id: 'legs.calf', patterns: ['calf'], required: false },
  ];
}

function absSlots(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
): { slots: TemplateSlot[]; leadPattern: Pattern } {
  const last = lastChosenPattern(history, library, 'abs', ABS_PATTERNS);
  const startIdx = last ? (ABS_PATTERNS.indexOf(last) + 1) % ABS_PATTERNS.length : 0;
  const rotated = [...ABS_PATTERNS.slice(startIdx), ...ABS_PATTERNS.slice(0, startIdx)];
  const slots: TemplateSlot[] = rotated.map((p, i) => ({
    id: `abs.${p}`,
    patterns: [p],
    // First three (anti_rotation/flexion/anti_extension family in rotated order) required;
    // lateral/oblique optional so it still fills first on tighter budgets when it leads.
    required: i < 3,
  }));
  return { slots, leadPattern: rotated[0] };
}

function fullSlots(
  targetMinutes: number,
  effort: Effort,
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
): TemplateSlot[] {
  // The knee-dominant lower slot alternates squat <-> lunge, exactly as the upper slots already
  // alternate push and pull variants. Both are laddered families with their own progression
  // state, and `lunge` is otherwise unreachable in a full-body session — §5.5 gives `full` no
  // lunge slot of its own, so the family sat idle while the squat rung repeated every session.
  // The hip-dominant slot stays fixed on `hinge`: it is the only hip-hinge family there is, and
  // dropping it would leave posterior chain uncovered.
  const lowerKnee = alternate(history, library, 'full', ['squat', 'lunge']);
  const upperPush = alternate(history, library, 'full', ['horizontal_push', 'vertical_push']);
  const upperPull = alternate(history, library, 'full', ['horizontal_pull', 'vertical_pull']);
  const core = alternate(history, library, 'full', ['anti_extension', 'flexion', 'anti_rotation']);
  const slots: TemplateSlot[] = [
    { id: 'full.lower_knee', patterns: [lowerKnee], required: true },
    { id: 'full.lower_hinge', patterns: ['hinge'], required: true },
    { id: 'full.upper_push', patterns: [upperPush], required: true },
    { id: 'full.upper_pull', patterns: [upperPull], required: true },
    { id: 'full.core', patterns: [core], required: true },
  ];
  if (effort === 'hard' || targetMinutes >= 40) {
    slots.push({ id: 'full.finisher', patterns: [], required: false, isFinisher: true });
  }
  return slots;
}

/**
 * Non-laddered patterns each focus can draw extra volume from when §5.6 time-fit needs more
 * slots than the base template supplies (a long target with a short static slot list). Laddered
 * patterns are deliberately excluded — repeating one would just re-resolve to the same
 * progression-state exercise (one per family per session), not real extra work. `full` has no
 * isolation slot of its own in §5.5, so its filler pool is the union of the other three focuses'
 * — a reasonable reading of "extra accessory work," not a spec-given menu.
 */
const ACCESSORY_PATTERNS_BY_FOCUS: Record<Focus, Pattern[]> = {
  upper: UPPER_ISOLATION,
  legs: ['abduction', 'hip_extension', 'calf'],
  abs: ['anti_rotation', 'flexion', 'lateral_flexion'],
  full: [
    ...UPPER_ISOLATION,
    'abduction',
    'hip_extension',
    'calf',
    'anti_rotation',
    'flexion',
    'lateral_flexion',
  ],
};

/**
 * §5.6 — "add ... until within ±10% of target." The base template's slot list is fixed and
 * short (a handful of required + a few optional slots); for a long target it can be exhausted
 * long before the budget is full. This appends additional optional slots, cycling through the
 * focus's non-laddered accessory patterns, up to `maxSlots` total (§5.6's exercise-count sanity
 * ceiling for the target length) or a hard runaway guard, whichever is smaller. Selection
 * (`selectMain`) still applies every §5.2 rule to these slots exactly as it does to the base
 * ones — this only supplies more candidate slots, it does not pick exercises or bypass variety.
 */
const EXPANSION_HARD_CAP = 14;

export function expandOptionalSlots(
  base: FocusTemplateResult,
  focus: Focus,
  maxSlots: number,
  /**
   * Where to start the accessory-pattern cycle (ADR 0010). This used to be hardcoded to 0, which
   * meant a template with room for exactly one extra slot — a 30-minute full-body session, say —
   * always appended `ACCESSORY_PATTERNS_BY_FOCUS[focus][0]`, so every such workout ended with a
   * curl. Advancing the offset per session rotates that slot through the whole accessory list.
   *
   * A history-derived rotation rather than an RNG draw, matching how `alternate()` already works
   * above: it guarantees even coverage where a draw can repeat the same pattern three sessions
   * running, and it keeps template building free of ambient randomness.
   */
  startOffset = 0,
): FocusTemplateResult {
  const patterns = ACCESSORY_PATTERNS_BY_FOCUS[focus];
  if (!patterns || patterns.length === 0) return base;
  const slots = [...base.slots];
  const ceiling = Math.min(maxSlots, EXPANSION_HARD_CAP);
  const offset = ((Math.trunc(startOffset) % patterns.length) + patterns.length) % patterns.length;
  let i = 0;
  while (slots.length < ceiling) {
    const pattern = patterns[(offset + i) % patterns.length];
    slots.push({ id: `${focus}.extra.${i}`, patterns: [pattern], required: false });
    i++;
  }
  return { slots, leadPattern: base.leadPattern };
}

/** How many sessions of this focus the generator has already shown the user — the rotation
 *  counter for `expandOptionalSlots`. ADR 0011: **discarded sessions count**, so abandoning a
 *  workout advances the accessory rotation exactly as it advances `alternate()`. Both are "what
 *  did I last see" questions; neither is a claim that the user trained. */
export function accessoryRotationOffset(
  history: readonly SessionHistoryRecord[],
  focus: Focus,
): number {
  return history.filter((s) => s.focus === focus).length;
}

export interface BuildTemplateInput {
  focus: Focus;
  targetMinutes: number;
  effort: Effort;
  library: readonly Exercise[];
  history: readonly SessionHistoryRecord[];
}

export function buildFocusTemplate(input: BuildTemplateInput): FocusTemplateResult {
  const { focus, targetMinutes, effort, library, history } = input;
  switch (focus) {
    case 'upper':
      return { slots: upperSlots(targetMinutes, history, library) };
    case 'legs':
      return { slots: legsSlots() };
    case 'abs': {
      const { slots, leadPattern } = absSlots(history, library);
      return { slots, leadPattern };
    }
    case 'full':
      return { slots: fullSlots(targetMinutes, effort, history, library) };
  }
}

/** §9.5 Quick Session — minimal template, 1 warmup + 3 main + 1 cooldown, `normal` effort.
 *  Same pipeline: this only shrinks the template to the 3 highest-priority required slots
 *  (falling back to optional ones if a focus has fewer than 3 required slots), it does not
 *  bypass hard filters, selection rules, or prescription. */
export function buildQuickSessionTemplate(input: BuildTemplateInput): FocusTemplateResult {
  const full = buildFocusTemplate(input);
  const required = full.slots.filter((s) => s.required);
  const optional = full.slots.filter((s) => !s.required);
  const chosen = [...required, ...optional].slice(0, 3);
  return { slots: chosen, leadPattern: full.leadPattern };
}
