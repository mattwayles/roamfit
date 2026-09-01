/**
 * §7.3 — "Validate anyway." This module is the code-side backstop the LLM proxy (and, in
 * principle, any other caller) runs on *every* model response before it is allowed to touch
 * product state. Nothing here calls a model or does I/O — it is pure data validation, which is
 * what makes it usable from both `packages/store` test doubles and the Cloud Function (a plain
 * node process that can depend on this package).
 *
 * Three jobs (§7.1), three narrow output shapes, three validators:
 *  - Natural-language intake never returns an exercise id, a set count, a rep target, or a band —
 *    those fields are structurally absent from `IntakeLlmOutput`, so "the LLM never selects
 *    exercises" (invariant 2) is enforced by the schema shape, not just by validating values.
 *    What *is* returned (focus/effort/targetMinutes/equipmentPreference) is checked against the
 *    same enums the engine already treats as legal, plus one optional suggested limitation tag
 *    that the caller must treat as a suggestion requiring confirmation, never an applied filter.
 *  - Coach voice rewrites the §5.8 line and may expand a setup cue for one exercise; the only
 *    thing to validate is that the exercise id it names (if any) is one that was actually in the
 *    session — it cannot introduce a reference to a different exercise.
 *  - Feedback distillation turns retrospective text into structured signals (suspected
 *    limitation, band too light, exercise aversion). Every exercise id it names must be one of
 *    the session's own entries; every suggested limitation tag must be a real contraindication
 *    tag from the controlled vocabulary — never an arbitrary string that could later be used to
 *    inject something into a filter.
 */
import type { Anchor, Contraindication, Focus } from '@roamfit/data';
import type { Effort, EquipmentPreference } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

const FOCUS_VALUES: readonly Focus[] = ['upper', 'abs', 'legs', 'full'];
const EFFORT_VALUES: readonly Effort[] = ['easy', 'normal', 'hard'];
const EQUIPMENT_VALUES: readonly EquipmentPreference[] = ['any', 'band', 'bodyweight'];

/** Kept in sync with `packages/data`'s `Contraindication` union by the type import — a value
 *  outside this list fails validation rather than being silently accepted. */
const CONTRAINDICATION_VALUES: readonly Contraindication[] = [
  'shoulder_overhead',
  'shoulder_horizontal',
  'elbow',
  'wrist_extension',
  'knee_flexion_loaded',
  'knee_impact',
  'hip',
  'lower_back_flexion',
  'lower_back_extension',
  'neck',
  'ankle',
  'core_pressure',
];

/** ADR-0002: the general pipeline's floor is 15 minutes; Quick Session (~7min) is the only
 *  supported sub-15 path and is never something NL intake offers (§9.5 is a fixed button, not a
 *  duration the user types). Cap generously above the longest realistic session so a hallucinated
 *  "600 minutes" doesn't reach the pipeline. */
const MIN_TARGET_MINUTES = 15;
const MAX_TARGET_MINUTES = 90;

/**
 * The shape a structured-output/tool-use response for natural-language intake must have.
 * Deliberately has no field that could name an exercise, a set, a rep target, or a band — the
 * absence is the enforcement mechanism, not a rule applied after the fact.
 */
export interface IntakeLlmOutput {
  focus: unknown;
  effort: unknown;
  targetMinutes: unknown;
  equipmentPreference?: unknown;
  /** A tag the model believes the user's freeform text implied (e.g. "shoulder's cranky"). Never
   *  applied automatically — the caller must treat this as a suggestion pending user
   *  confirmation, matching a `Limitation.source: 'pain_report'` only once confirmed. */
  suggestedLimitationTag?: unknown;
}

export function validateIntakeOutput(output: IntakeLlmOutput): ValidationResult {
  const errors: string[] = [];
  if (!FOCUS_VALUES.includes(output.focus as Focus)) {
    errors.push(`focus "${String(output.focus)}" is not a valid Focus`);
  }
  if (!EFFORT_VALUES.includes(output.effort as Effort)) {
    errors.push(`effort "${String(output.effort)}" is not a valid Effort`);
  }
  if (
    typeof output.targetMinutes !== 'number' ||
    !Number.isFinite(output.targetMinutes) ||
    output.targetMinutes < MIN_TARGET_MINUTES ||
    output.targetMinutes > MAX_TARGET_MINUTES
  ) {
    errors.push(
      `targetMinutes "${String(output.targetMinutes)}" is not a number in [${MIN_TARGET_MINUTES}, ${MAX_TARGET_MINUTES}]`,
    );
  }
  if (
    output.equipmentPreference !== undefined &&
    !EQUIPMENT_VALUES.includes(output.equipmentPreference as EquipmentPreference)
  ) {
    errors.push(`equipmentPreference "${String(output.equipmentPreference)}" is not valid`);
  }
  if (
    output.suggestedLimitationTag !== undefined &&
    !CONTRAINDICATION_VALUES.includes(output.suggestedLimitationTag as Contraindication)
  ) {
    errors.push(`suggestedLimitationTag "${String(output.suggestedLimitationTag)}" is not valid`);
  }
  // Reject silently-smuggled selection fields outright — belt and suspenders on top of the
  // schema shape itself (a hand-rolled JSON.parse response could still carry them).
  const forbidden = ['exerciseId', 'exerciseIds', 'sets', 'reps', 'band', 'bandId', 'load'];
  for (const key of forbidden) {
    if (key in (output as unknown as Record<string, unknown>)) {
      errors.push(`intake output must never contain "${key}" — the engine selects, not the LLM`);
    }
  }
  return errors.length ? fail(...errors) : ok();
}

/** Coach voice may rewrite the §5.8 line freely (it's just prose) and may optionally expand the
 *  setup cue for exactly one exercise, named by id. That id must be one that was actually in the
 *  session. */
export interface CoachVoiceLlmOutput {
  rewrittenExplanation: unknown;
  expandedCueExerciseId?: unknown;
  expandedCueText?: unknown;
}

const MAX_EXPLANATION_LENGTH = 600;

export function validateCoachVoiceOutput(
  output: CoachVoiceLlmOutput,
  sessionExerciseIds: readonly string[],
): ValidationResult {
  const errors: string[] = [];
  if (
    typeof output.rewrittenExplanation !== 'string' ||
    output.rewrittenExplanation.trim() === ''
  ) {
    errors.push('rewrittenExplanation must be a non-empty string');
  } else if (output.rewrittenExplanation.length > MAX_EXPLANATION_LENGTH) {
    errors.push(`rewrittenExplanation exceeds ${MAX_EXPLANATION_LENGTH} characters`);
  }
  if (output.expandedCueExerciseId !== undefined) {
    if (typeof output.expandedCueExerciseId !== 'string') {
      errors.push('expandedCueExerciseId must be a string');
    } else if (!sessionExerciseIds.includes(output.expandedCueExerciseId)) {
      errors.push(
        `expandedCueExerciseId "${output.expandedCueExerciseId}" is not one of this session's exercises`,
      );
    }
    if (typeof output.expandedCueText !== 'string' || output.expandedCueText.trim() === '') {
      errors.push('expandedCueText must be a non-empty string when expandedCueExerciseId is set');
    }
  }
  return errors.length ? fail(...errors) : ok();
}

/** Feedback distillation: retrospective text -> structured signals. Every exercise id named must
 *  be one of the session's own entries; every suggested limitation tag must be real. */
export interface DistillationLlmOutput {
  suspectedLimitationTag?: unknown;
  bandTooLightExerciseIds?: unknown;
  aversionExerciseIds?: unknown;
}

export function validateDistillationOutput(
  output: DistillationLlmOutput,
  sessionExerciseIds: readonly string[],
): ValidationResult {
  const errors: string[] = [];
  if (
    output.suspectedLimitationTag !== undefined &&
    !CONTRAINDICATION_VALUES.includes(output.suspectedLimitationTag as Contraindication)
  ) {
    errors.push(`suspectedLimitationTag "${String(output.suspectedLimitationTag)}" is not valid`);
  }
  for (const [field, value] of [
    ['bandTooLightExerciseIds', output.bandTooLightExerciseIds],
    ['aversionExerciseIds', output.aversionExerciseIds],
  ] as const) {
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      errors.push(`${field} must be an array`);
      continue;
    }
    for (const id of value) {
      if (typeof id !== 'string' || !sessionExerciseIds.includes(id)) {
        errors.push(`${field} references "${String(id)}", not one of this session's exercises`);
      }
    }
  }
  return errors.length ? fail(...errors) : ok();
}

/** Generic anchor-set sanity check, reusable anywhere an LLM output claims an anchor is
 *  available — never trusted to be one of the enabled set on its own. */
export function isKnownAnchor(value: unknown, known: readonly Anchor[]): value is Anchor {
  return typeof value === 'string' && (known as readonly string[]).includes(value);
}
