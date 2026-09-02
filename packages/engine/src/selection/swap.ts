/**
 * §10.6 mid-workout swap. "The #1 real-world interaction: the band snapped, someone's on the
 * bar, the ceiling is too low, the shoulder twinged." One tap from any set, offering 3-5
 * alternatives that:
 *   - fill the SAME pattern slot as the entry being replaced,
 *   - respect ALL current hard filters (§13.2 injuries, §5.3 anchors, §13.1 bodyweight-bearing
 *     effort cap — reused verbatim from `applyHardFilters`/`effortCapForExercise`, never
 *     reimplemented here),
 *   - sit at the SAME progression level, approximated (since a laddered family has exactly one
 *     exercise per level — see `packages/data`'s `ProgressionFamily.levels`, invariant 5) by
 *     matching the replaced exercise's own `difficulty` band, so a swap never quietly hands the
 *     user something meaningfully harder or easier than what was prescribed.
 *
 * This is a selection-only concern per CLAUDE.md invariant 2 ("the engine decides, the LLM
 * decorates") and the wave-04 rule ("no business logic in components") — `app/` calls
 * `alternativesForSlot`/`buildSwapReplacementEntry` and presents the result; it must never filter
 * or rank candidates itself.
 */
import type { Anchor, Exercise, Pattern } from '@roamfit/data';
import { applyHardFilters, effortCapForExercise } from '../filters/hardFilters';
import { repExerciseSec, timedExerciseSec } from '../timefit/formulas';
import { EFFORT_TABLE } from '../prescription/effortTable';
import { buildCandidates, type CandidateContext } from './candidates';
import { BAND_ORDER } from '../types';
import type {
  BandId,
  Candidate,
  EquipmentPreference,
  LocalDate,
  Limitation,
  SessionEntry,
} from '../types';

const DIFFICULTY_RANK: Record<Exercise['difficulty'], number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const TIER_RANK: Record<Candidate['tier'], number> = {
  preferred: 0,
  soft: 1,
  blocked: 2,
};

export interface SwapSlotRequest {
  library: readonly Exercise[];
  /** The entry being replaced — its `pattern`/`exerciseId`/`band`/`sets`/etc define the slot. */
  entry: SessionEntry;
  anchorsAvailable: readonly Anchor[];
  limitations: readonly Limitation[];
  equipmentPreference?: EquipmentPreference;
  today: LocalDate;
  history: CandidateContext['history'];
  exerciseStates: CandidateContext['exerciseStates'];
  /** §10.6 "different anchor" quick-filter — excludes the replaced exercise's own anchor point,
   *  or any anchor the caller names, from the alternatives offered. */
  excludeAnchor?: Anchor;
  /** Default 5 (spec: "3-5 alternatives"). */
  maxResults?: number;
}

export interface SwapAlternative {
  exercise: Exercise;
  /** Ready to hand straight to the store as the replacement entry — same slot shape (sets,
   *  rest, tempo, effort), re-prescribed for the new exercise's own metric/equipment. */
  replacement: SessionEntry;
}

function findExercise(library: readonly Exercise[], id: string): Exercise | undefined {
  return library.find((e) => e.id === id);
}

/** Nearest available band to `target` in `library`'s suggested range for `exercise`, biased to
 *  stay in-range rather than drifting the user's working weight on a swap. */
function bandForExercise(exercise: Exercise, target: BandId | null): BandId | null {
  if (exercise.equipment !== 'band' || !exercise.band) return null;
  const [lo, hi] = exercise.band.split('-') as [BandId, BandId | undefined];
  const loIdx = BAND_ORDER.indexOf(lo);
  const hiIdx = hi ? BAND_ORDER.indexOf(hi) : loIdx;
  if (!target) return lo;
  const targetIdx = BAND_ORDER.indexOf(target);
  const clampedIdx = Math.min(Math.max(targetIdx, loIdx), hiIdx);
  return BAND_ORDER[clampedIdx];
}

/**
 * Re-prescribes `exercise` into the same slot `entry` occupied: same `sets`/`restSec`/`tempoSec`/
 * effort, adapted for the new exercise's metric (reps vs. time) and equipment (band vs.
 * bodyweight). `substitutedFor` is set to the id of the exercise the swap replaced — session-only,
 * mirrors how the engine already records an in-generation substitution (§4.7), does not persist a
 * level change.
 */
export function buildSwapReplacementEntry(exercise: Exercise, entry: SessionEntry): SessionEntry {
  const effort = effortCapForExercise(exercise, entry.effort);
  const row = EFFORT_TABLE[effort];
  const isTimed = exercise.metric === 'time';
  const band = bandForExercise(exercise, entry.band);
  const sets = entry.sets;
  const repTarget = isTimed ? undefined : (entry.repTarget ?? row.reps);
  const durationSec = isTimed ? (exercise.default_seconds ?? entry.durationSec ?? 30) : undefined;

  const estimatedSec = isTimed
    ? timedExerciseSec({
        sets,
        durationSec: durationSec!,
        restSec: entry.restSec,
        unilateral: exercise.unilateral,
        anchorRebuild: exercise.anchor !== 'none',
      })
    : repExerciseSec({
        sets,
        reps: repTarget ?? row.reps,
        tempoSec: entry.tempoSec,
        restSec: entry.restSec,
        unilateral: exercise.unilateral,
      });

  const sameFamilyLevel =
    exercise.progression_family && exercise.progression_level_id
      ? { familyId: exercise.progression_family, levelId: exercise.progression_level_id }
      : null;

  return {
    exerciseId: exercise.id,
    role: 'main',
    group: entry.group,
    band,
    sets,
    repTarget,
    durationSec,
    restSec: entry.restSec,
    tempoSec: entry.tempoSec,
    notes: isTimed ? undefined : entry.notes,
    effort,
    progressionFamilyId: sameFamilyLevel?.familyId ?? null,
    progressionLevelIdAtTime: sameFamilyLevel?.levelId ?? null,
    pattern: exercise.pattern,
    anchorClass: exercise.anchor_class,
    unilateral: exercise.unilateral,
    estimatedSec,
    substitutedFor: entry.exerciseId,
  };
}

/**
 * §10.6 — 3-5 alternatives filling `req.entry`'s pattern slot, all hard filters respected, ranked
 * closest-to-original-difficulty first (the "same progression level" approximation, see file
 * header), then by recency tier (never-suppressed, least-recently-used first) and enjoyment.
 * Deterministic — no rng — because a swap is a direct response to "this specific one didn't
 * work," not a fresh randomized pick.
 */
export function alternativesForSlot(req: SwapSlotRequest): SwapAlternative[] {
  const maxResults = req.maxResults ?? 5;
  const current = findExercise(req.library, req.entry.exerciseId);
  const targetDifficultyRank = DIFFICULTY_RANK[current?.difficulty ?? 'medium'];

  const hardFiltered = applyHardFilters({
    library: req.library,
    request: { equipmentPreference: req.equipmentPreference },
    anchorsAvailable: req.anchorsAvailable,
    limitations: req.limitations,
    today: req.today,
  });

  const pattern: Pattern = req.entry.pattern;
  const excludeAnchor = req.excludeAnchor ?? undefined;

  const pool = hardFiltered.filter(
    (e) =>
      e.pattern === pattern &&
      e.roles.includes('main') &&
      e.id !== req.entry.exerciseId &&
      (!excludeAnchor || e.anchor !== excludeAnchor),
  );

  const candidates = buildCandidates(pool, 'main', {
    history: req.history,
    exerciseStates: req.exerciseStates,
    today: req.today,
  }).filter((c) => !c.isSuppressed);

  const ranked = [...candidates].sort((a, b) => {
    const diffA = Math.abs(DIFFICULTY_RANK[a.exercise.difficulty] - targetDifficultyRank);
    const diffB = Math.abs(DIFFICULTY_RANK[b.exercise.difficulty] - targetDifficultyRank);
    if (diffA !== diffB) return diffA - diffB;
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (b.enjoyment !== a.enjoyment) return b.enjoyment - a.enjoyment;
    return a.exercise.id.localeCompare(b.exercise.id);
  });

  return ranked.slice(0, maxResults).map((c) => ({
    exercise: c.exercise,
    replacement: buildSwapReplacementEntry(c.exercise, req.entry),
  }));
}
