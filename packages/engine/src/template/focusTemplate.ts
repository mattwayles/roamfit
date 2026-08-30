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
 *  whose pattern is in `candidates`. Used to alternate a template choice session to session. */
function lastChosenPattern(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  focus: Focus,
  candidates: readonly Pattern[],
): Pattern | undefined {
  const byId = new Map(library.map((e) => [e.id, e]));
  for (let i = history.length - 1; i >= 0; i--) {
    const session = history[i];
    if (session.focus !== focus || session.status === 'discarded') continue;
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
  const rotated = [
    ...ABS_PATTERNS.slice(startIdx),
    ...ABS_PATTERNS.slice(0, startIdx),
  ];
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
  const upperPush = alternate(history, library, 'full', ['horizontal_push', 'vertical_push']);
  const upperPull = alternate(history, library, 'full', ['horizontal_pull', 'vertical_pull']);
  const core = alternate(history, library, 'full', ['anti_extension', 'flexion', 'anti_rotation']);
  const slots: TemplateSlot[] = [
    { id: 'full.lower_push', patterns: ['squat'], required: true },
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
