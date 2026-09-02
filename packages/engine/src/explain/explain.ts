/**
 * §5.8 — the explanation line. Required, not optional: every generated session names what it
 * balanced and what changed. A deterministic template string (step 7 is code; the LLM may later
 * rewrite the *wording*, never the facts — §7.2).
 */
import type { Pattern } from '@roamfit/data';

const PATTERN_LABELS: Record<Pattern, string> = {
  horizontal_push: 'pressing',
  vertical_push: 'overhead pressing',
  horizontal_pull: 'rowing',
  vertical_pull: 'pulling',
  squat: 'squatting',
  hinge: 'hip-hinging',
  lunge: 'lunging',
  hip_extension: 'glute work',
  knee_flexion: 'hamstring work',
  knee_extension: 'quad work',
  abduction: 'hip work',
  calf: 'calf work',
  anti_rotation: 'anti-rotation core work',
  anti_extension: 'plank work',
  flexion: 'core flexion',
  lateral_flexion: 'side core work',
  elbow_flexion: 'biceps work',
  elbow_extension: 'triceps work',
  shoulder_isolation: 'shoulder work',
};

export interface LevelUpFact {
  exerciseName: string;
  levelN: number;
  levelOf: number;
}

export interface MasteryFact {
  exerciseName: string;
}

export interface SubstitutionFact {
  fromName: string;
  toName: string;
}

export interface PatternGapFact {
  pattern: Pattern;
  resolution: 'used_band' | 'stated_imbalance';
}

export interface TimeBudgetDeviationFact {
  targetMinutes: number;
  estimatedMinutes: number;
  direction: 'under' | 'over';
  reason: 'thin_pool' | 'template_exhausted' | 'structural_minimum';
}

export interface ExplanationInputs {
  /** §5.2 48h recovery — set when the session was lightened on specific muscles. */
  recoveryMuscleLabel?: string;
  levelUps: readonly LevelUpFact[];
  masteryPrChecks: readonly MasteryFact[];
  /** §5.2 novelty — exercise names never performed before, included this session. */
  noveltyExerciseNames: readonly string[];
  /** §6.3/progression/resolveSlot.ts session-only ladder substitutions. */
  substitutions: readonly SubstitutionFact[];
  patternGaps: readonly PatternGapFact[];
  /** §5.6 — set only when, after every fill/trim lever, the estimate still falls outside ±10%
   *  of target. Never silent, the same as a PATTERN GAP. */
  timeBudgetDeviation?: TimeBudgetDeviationFact;
  /** ADR 0002 — the requested length was below the 15-minute floor and got bumped up. */
  minimumTargetClamp?: { requestedMinutes: number; effectiveMinutes: number };
  /** §9.4 comeback copy, verbatim when present ("Welcome back — let's ease in."). */
  comebackNotice?: string;
  /** §6.5 — shown once, on the very first session only. */
  calibrationFirstSessionNotice?: boolean;
  /** A pattern/muscle group the session deliberately balanced against recent volume, when
   *  nothing more specific (recovery/level-up/novelty) applies — keeps the line non-generic. */
  balancedAgainst?: Pattern;
}

export function composeExplanation(input: ExplanationInputs): string {
  const sentences: string[] = [];

  if (input.comebackNotice) sentences.push(input.comebackNotice);

  if (input.minimumTargetClamp) {
    const { requestedMinutes, effectiveMinutes } = input.minimumTargetClamp;
    sentences.push(
      `${requestedMinutes} min is too short to build a full session around — targeting ${effectiveMinutes} min instead. For something quicker, use Quick Session.`,
    );
  }

  if (input.timeBudgetDeviation) {
    const { targetMinutes, estimatedMinutes, direction, reason } = input.timeBudgetDeviation;
    sentences.push(
      direction === 'over'
        ? `Runs about ${estimatedMinutes} min instead of your ${targetMinutes} min target — couldn't trim further without dropping a required exercise.`
        : reason === 'thin_pool'
          ? `Runs about ${estimatedMinutes} min instead of your ${targetMinutes} min target — not enough fresh work in the pool right now to fill the rest.`
          : `Runs about ${estimatedMinutes} min instead of your ${targetMinutes} min target — filled everything this template offers for a session this long.`,
    );
  }

  if (input.recoveryMuscleLabel) {
    sentences.push(
      `Lighter on ${input.recoveryMuscleLabel} — you trained it hard in the last two days.`,
    );
  }

  for (const gap of input.patternGaps) {
    const label = PATTERN_LABELS[gap.pattern];
    sentences.push(
      gap.resolution === 'used_band'
        ? `Used a band for ${label} since bodyweight alone can't cover it.`
        : `No ${label} today — this session is deliberately unbalanced without it.`,
    );
  }

  for (const sub of input.substitutions) {
    sentences.push(`${sub.fromName} wasn't available, so ${sub.toName} instead.`);
  }

  for (const lvl of input.levelUps) {
    sentences.push(`${lvl.exerciseName} moved up to Level ${lvl.levelN} of ${lvl.levelOf}.`);
  }

  for (const pr of input.masteryPrChecks) {
    sentences.push(`Chasing a new best set on ${pr.exerciseName} — you've maxed its ladder.`);
  }

  if (input.noveltyExerciseNames.length > 0) {
    sentences.push(`New today: ${input.noveltyExerciseNames.join(', ')}.`);
  }

  if (input.calibrationFirstSessionNotice) {
    sentences.push(
      "Your first few sessions set your starting levels — push a little and it'll calibrate fast.",
    );
  }

  if (sentences.length === 0) {
    const label = input.balancedAgainst ? PATTERN_LABELS[input.balancedAgainst] : undefined;
    sentences.push(
      label
        ? `Balanced to keep working ${label} without repeating what you just did.`
        : 'Balanced across your recent sessions — nothing repeated, nothing overloaded.',
    );
  }

  return sentences.join(' ');
}
