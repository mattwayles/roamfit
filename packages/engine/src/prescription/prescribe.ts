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
import { parseBandRange } from '../progression/micro';
import { EFFORT_TABLE } from './effortTable';
import { repExerciseSec, timedExerciseSec } from '../timefit/formulas';

function dropOneBand(band: BandId | null): BandId | null {
  if (!band) return band;
  const idx = BAND_ORDER.indexOf(band);
  return idx > 0 ? BAND_ORDER[idx - 1] : band;
}

/**
 * ADR 0010 compatibility rule 3 — `micro.band` is a property of the level, tracked against its
 * *anchor* exercise, but the exercise actually programmed may be any sibling at that level, with
 * its own authored band range. Clamp into the range the exercise was written for:
 *
 * - a bodyweight sibling has no band at all, whatever the anchor's micro says;
 * - a band sibling at a bodyweight anchor's level starts at the lightest band it supports;
 * - otherwise the anchor's band is pulled inside the sibling's own [min, max] window.
 *
 * Without this, a `micro.band` of B3 (legal for an rdl anchor at B3-B4) would be prescribed
 * against a B1-B2 sibling — a band that exercise is not authored for.
 */
function clampBandToExercise(band: BandId | null, exercise: Exercise): BandId | null {
  if (exercise.equipment !== 'band') return null;
  const range = parseBandRange(exercise.band);
  if (!range) return null;
  if (!band) return range[0];
  const [lo, hi] = range;
  const idx = BAND_ORDER.indexOf(band);
  const loIdx = BAND_ORDER.indexOf(lo);
  const hiIdx = BAND_ORDER.indexOf(hi);
  if (idx < 0 || loIdx < 0 || hiIdx < 0) return range[0];
  return BAND_ORDER[Math.min(Math.max(idx, loIdx), hiIdx)];
}

export interface PrescribeLadderedInput {
  exercise: Exercise;
  familyId: ProgressionFamilyId;
  levelId: string;
  micro: {
    repTarget: number;
    band: BandId | null;
    tempoSec: number;
    restSec: number;
    sets: number;
  };
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
  const { exercise, familyId, levelId, micro, requestedEffort, recoveryTreatment, substitutedFor } =
    input;
  const effort = effortCapForExercise(
    exercise,
    recoveryTreatment ? capBelowHard(requestedEffort) : requestedEffort,
  );
  const levelBand = clampBandToExercise(micro.band, exercise);
  const band = recoveryTreatment ? dropOneBand(levelBand) : levelBand;
  const isTimed = exercise.metric === 'time';
  const sets = scaleSets(micro.sets, input.setsMultiplier);
  const estimatedSec = isTimed
    ? timedExerciseSec({
        sets,
        durationSec: micro.repTarget,
        restSec: micro.restSec,
        unilateral: exercise.unilateral,
      })
    : repExerciseSec({
        sets,
        reps: micro.repTarget,
        tempoSec: micro.tempoSec,
        restSec: micro.restSec,
        unilateral: exercise.unilateral,
      });

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
  const effort = effortCapForExercise(
    exercise,
    recoveryTreatment ? capBelowHard(requestedEffort) : requestedEffort,
  );
  const row = EFFORT_TABLE[effort];
  const suggestedBand = parseFirstBand(exercise.band);
  const band =
    exercise.equipment === 'band'
      ? recoveryTreatment
        ? dropOneBand(suggestedBand)
        : suggestedBand
      : null;
  const isTimed = exercise.metric === 'time';
  const durationSec = isTimed ? (exercise.default_seconds ?? 30) : undefined;
  const amrap = Boolean(input.isFinisherAmrap) && !isTimed && effort === 'hard';
  const sets = scaleSets(row.sets, input.setsMultiplier);

  const estimatedSec = isTimed
    ? timedExerciseSec({
        sets,
        durationSec: durationSec!,
        restSec: row.restSec,
        unilateral: exercise.unilateral,
      })
    : repExerciseSec({
        sets,
        reps: row.reps,
        tempoSec: row.tempoSec,
        restSec: row.restSec,
        unilateral: exercise.unilateral,
      });

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

/** One set, twelve unloaded-tempo reps, no rest — the dose that distinguishes "warming this
 *  movement up" from "training it". A main exercise programmed into the warm-up section gets this
 *  instead of the effort table's 3x8-12 at its working band, which is the whole point of one
 *  exercise being eligible for both. */
const WARMUP_COOLDOWN_REPS = 12;
const WARMUP_COOLDOWN_TEMPO_SEC = 2;
/** A hold used to warm up is capped here however long the record says it can be held for real —
 *  a 60s working plank is a set, not a warm-up. Cool-downs are not capped: a stretch's authored
 *  `default_seconds` *is* its cool-down dose. */
const WARMUP_HOLD_CAP_SEC = 45;
const DEFAULT_HOLD_SEC = 45;

export function prescribeWarmupCooldown(
  exercise: Exercise,
  role: Extract<Role, 'warmup' | 'cooldown'>,
): SessionEntry {
  const authoredHold = exercise.default_seconds ?? DEFAULT_HOLD_SEC;
  const durationSec =
    role === 'warmup' ? Math.min(authoredHold, WARMUP_HOLD_CAP_SEC) : authoredHold;
  // The lightest band the exercise is authored for, never the working band and never nothing at
  // all: a band row warmed up with no band is a different movement, and this used to hard-code
  // `null` because the only exercises that reached here were purpose-built bodyweight drills.
  const band = exercise.equipment === 'band' ? parseFirstBand(exercise.band) : null;
  const estimatedSec =
    exercise.metric === 'time'
      ? timedExerciseSec({ sets: 1, durationSec, restSec: 0, unilateral: exercise.unilateral })
      : repExerciseSec({
          sets: 1,
          reps: WARMUP_COOLDOWN_REPS,
          tempoSec: WARMUP_COOLDOWN_TEMPO_SEC,
          restSec: 0,
          unilateral: exercise.unilateral,
        });
  return {
    exerciseId: exercise.id,
    role,
    band,
    sets: 1,
    repTarget: exercise.metric === 'time' ? undefined : WARMUP_COOLDOWN_REPS,
    durationSec: exercise.metric === 'time' ? durationSec : undefined,
    restSec: 0,
    tempoSec: exercise.metric === 'time' ? 0 : WARMUP_COOLDOWN_TEMPO_SEC,
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

/**
 * §5.6 time-fit correction, precise version: a proportional sets *multiplier* rounds to the
 * nearest integer, which is too coarse to move a small integer like `sets` at all when the
 * needed correction is under ~15% (`round(3 * 0.9)` is still 3) — exactly the case for the
 * mainstream 25-60min overruns this exists to fix. This instead removes exactly one set from one
 * entry and recomputes its `estimatedSec` from the same formula prescription used, so the caller
 * (`pipeline.ts`) can decrement precisely, one set at a time, from whichever entry is currently
 * largest, until the session is back in budget or every entry is at the sets floor (1). A no-op
 * (returns the same entry) once `sets` is already 1.
 */
/**
 * §5.6 `estimatedSec` for an entry whose shape has changed — the one place that arithmetic lives,
 * so a caller editing sets/reps/duration never re-derives it (CLAUDE.md invariant 2). Takes loose
 * fields rather than a `SessionEntry` so the store can call it with a database row.
 *
 * A stale `estimatedSec` is not cosmetic: the approval screen's "~N min estimated" is a plain sum
 * over this field, and §5.6's whole time budget is denominated in it.
 */
export function estimateEntrySec(params: {
  sets: number;
  repTarget?: number | null;
  durationSec?: number | null;
  restSec: number;
  tempoSec: number;
  unilateral: boolean;
}): number {
  return params.durationSec != null
    ? timedExerciseSec({
        sets: params.sets,
        durationSec: params.durationSec,
        restSec: params.restSec,
        unilateral: params.unilateral,
      })
    : repExerciseSec({
        sets: params.sets,
        // AMRAP entries have no repTarget; 10 is a reasonable formula estimate.
        reps: params.repTarget ?? 10,
        tempoSec: params.tempoSec,
        restSec: params.restSec,
        unilateral: params.unilateral,
      });
}

export function withOneFewerSet(entry: SessionEntry): SessionEntry {
  if (entry.sets <= 1) return entry;
  const sets = entry.sets - 1;
  return { ...entry, sets, estimatedSec: estimateEntrySec({ ...entry, sets }) };
}
