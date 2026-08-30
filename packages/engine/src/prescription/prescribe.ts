/**
 * §5.1 step 5 — sets, reps or seconds, band, tempo, rest, from the §5.4 effort table. Builds a
 * concrete `SessionEntry` for each resolved slot (laddered or accessory, warmup or cooldown).
 *
 * Laddered exercises (§6.6): the band/rep-or-hold-target/tempo/rest/sets come straight from
 * `ProgressionState.micro` — that IS the current working prescription, tracked independently of
 * the day's chosen effort (§5.4: "effort for today, not absolute difficulty... a property of
 * their progression level"). The day's effort still governs non-laddered accessory exercises via
 * `EFFORT_TABLE`, and — for every main exercise regardless of family — the §13.1 bodyweight-
 * bearing cap and the 48h recovery band-drop (documented as a per-entry treatment rather than a
 * strict "at most one" count, see STATUS-2-engine.md).
 */
import type { Exercise, ProgressionFamilyId, Role } from '@roamfit/data';
import { BAND_ORDER } from '../types';
import type { BandId, Effort, SessionEntry } from '../types';
import { effortCapForExercise } from '../filters/hardFilters';
import { EFFORT_TABLE } from './effortTable';
import { repExerciseSec, timedExerciseSec } from '../timefit/formulas';

function dropOneBand(band: BandId | null): BandId | null {
  if (!band) return band;
  const idx = BAND_ORDER.indexOf(band);
  return idx > 0 ? BAND_ORDER[idx - 1] : band;
}

export interface PrescribeLadderedInput {
  exercise: Exercise;
  familyId: ProgressionFamilyId;
  levelId: string;
  micro: { repTarget: number; band: BandId | null; tempoSec: number; restSec: number; sets: number };
  requestedEffort: Effort;
  /** §5.2 48h recovery — this exercise touches a muscle trained hard in the last 2 days. */
  recoveryTreatment: boolean;
  substitutedFor?: string;
  /** §9.4/§9.9 comeback/Recovery Week volume cut (~0.8), applied to sets. 1 = no cut. */
  setsMultiplier?: number;
}

function scaleSets(sets: number, multiplier: number | undefined): number {
  if (!multiplier || multiplier === 1) return sets;
  return Math.max(1, Math.round(sets * multiplier));
}

export function prescribeLaddered(input: PrescribeLadderedInput): SessionEntry {
  const { exercise, familyId, levelId, micro, requestedEffort, recoveryTreatment, substitutedFor } = input;
  const effort = effortCapForExercise(exercise, recoveryTreatment ? capBelowHard(requestedEffort) : requestedEffort);
  const band = recoveryTreatment ? dropOneBand(micro.band) : micro.band;
  const isTimed = exercise.metric === 'time';
  const sets = scaleSets(micro.sets, input.setsMultiplier);
  const estimatedSec = isTimed
    ? timedExerciseSec({ sets, durationSec: micro.repTarget, restSec: micro.restSec, unilateral: exercise.unilateral })
    : repExerciseSec({ sets, reps: micro.repTarget, tempoSec: micro.tempoSec, restSec: micro.restSec, unilateral: exercise.unilateral });

  return {
    exerciseId: exercise.id,
    role: 'main',
    band,
    sets,
    repTarget: isTimed ? undefined : micro.repTarget,
    durationSec: isTimed ? micro.repTarget : undefined,
    restSec: micro.restSec,
    tempoSec: micro.tempoSec,
    effort,
    progressionFamilyId: familyId,
    progressionLevelIdAtTime: levelId,
    pattern: exercise.pattern,
    anchorClass: exercise.anchor_class,
    unilateral: exercise.unilateral,
    estimatedSec,
    substitutedFor,
  };
}

function capBelowHard(effort: Effort): Effort {
  return effort === 'hard' ? 'normal' : effort;
}

export interface PrescribeAccessoryInput {
  exercise: Exercise;
  requestedEffort: Effort;
  recoveryTreatment: boolean;
  /** The `full` template's finisher slot, at `hard` effort, gets an AMRAP-style prescription
   *  (§5.4/§5.5). */
  isFinisherAmrap?: boolean;
  bandRelaxedForPatternGap?: boolean;
  /** §9.4/§9.9 comeback/Recovery Week volume cut (~0.8), applied to sets. 1 = no cut. */
  setsMultiplier?: number;
}

export function prescribeAccessory(input: PrescribeAccessoryInput): SessionEntry {
  const { exercise, requestedEffort, recoveryTreatment } = input;
  const effort = effortCapForExercise(exercise, recoveryTreatment ? capBelowHard(requestedEffort) : requestedEffort);
  const row = EFFORT_TABLE[effort];
  const suggestedBand = parseFirstBand(exercise.band);
  const band = exercise.equipment === 'band' ? (recoveryTreatment ? dropOneBand(suggestedBand) : suggestedBand) : null;
  const isTimed = exercise.metric === 'time';
  const durationSec = isTimed ? (exercise.default_seconds ?? 30) : undefined;
  const amrap = Boolean(input.isFinisherAmrap) && !isTimed && effort === 'hard';
  const sets = scaleSets(row.sets, input.setsMultiplier);

  const estimatedSec = isTimed
    ? timedExerciseSec({ sets, durationSec: durationSec!, restSec: row.restSec, unilateral: exercise.unilateral })
    : repExerciseSec({ sets, reps: row.reps, tempoSec: row.tempoSec, restSec: row.restSec, unilateral: exercise.unilateral });

  return {
    exerciseId: exercise.id,
    role: 'main',
    band,
    sets,
    repTarget: isTimed || amrap ? undefined : row.reps,
    durationSec: isTimed ? durationSec : undefined,
    restSec: row.restSec,
    tempoSec: row.tempoSec,
    notes: amrap ? 'AMRAP' : undefined,
    effort,
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: exercise.pattern,
    anchorClass: exercise.anchor_class,
    unilateral: exercise.unilateral,
    estimatedSec,
  };
}

export function prescribeWarmupCooldown(exercise: Exercise, role: Extract<Role, 'warmup' | 'cooldown'>): SessionEntry {
  const durationSec = exercise.default_seconds ?? 45;
  const estimatedSec =
    exercise.metric === 'time'
      ? timedExerciseSec({ sets: 1, durationSec, restSec: 0, unilateral: exercise.unilateral })
      : repExerciseSec({ sets: 1, reps: 12, tempoSec: 2, restSec: 0, unilateral: exercise.unilateral });
  return {
    exerciseId: exercise.id,
    role,
    band: null,
    sets: 1,
    repTarget: exercise.metric === 'time' ? undefined : 12,
    durationSec: exercise.metric === 'time' ? durationSec : undefined,
    restSec: 0,
    tempoSec: exercise.metric === 'time' ? 0 : 2,
    effort: 'normal',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: exercise.pattern,
    anchorClass: exercise.anchor_class,
    unilateral: exercise.unilateral,
    estimatedSec,
  };
}

function parseFirstBand(band: string | null): BandId | null {
  if (!band) return null;
  return band.split('-')[0] as BandId;
}
