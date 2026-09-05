import { fitMainEntries } from './fitSession';
import { repExerciseSec } from './formulas';
import { createRng } from '../rng';
import type { SessionEntry } from '../types';

/** `estimatedSec` is always derived from the same fields `repExerciseSec` would use — the fit
 *  loop now recomputes it directly (via `estimateEntrySec`) whenever it changes an entry's set
 *  count, so a fixture whose `estimatedSec` doesn't match its own fields would silently drift
 *  from what the fit loop actually measures. */
function entry(id: string, sets: number, restSec = 45): SessionEntry {
  return {
    exerciseId: id,
    role: 'main',
    band: null,
    sets,
    repTarget: 10,
    restSec,
    tempoSec: 3,
    difficulty: 'medium',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: 'horizontal_push',
    anchorClass: 'none',
    unilateral: false,
    estimatedSec: repExerciseSec({ sets, reps: 10, tempoSec: 3, restSec, unilateral: false }),
  };
}

describe('§5.1 step 6 time fit', () => {
  it('trims a required entry before dropping it, and drops it if even 1 set does not fit', () => {
    // Each entry costs 220s at its 1-set floor (10*3 + 130 + 60); three floors (660s) exceed the
    // 594s ceiling, but two (440s) fit — so exactly one of the three required entries is dropped.
    const slots = [
      { required: true, entry: entry('a', 3, 130) },
      { required: true, entry: entry('b', 3, 130) },
      { required: true, entry: entry('c', 3, 130) },
    ];
    // Required is priority, not a guarantee (see module comment): with no `rng` given, the drop
    // falls to the tail of the list, so 'a' and 'b' survive (each still at the 1-set floor — the
    // 440s the two of them cost together leaves no further room to grow) and 'c' is dropped,
    // rather than forcing the session over budget.
    const result = fitMainEntries(slots, 15, 180, 180); // budget = (15-3-3)*60=540s, ceiling=594s
    expect(result.main.map((e) => e.exerciseId)).toEqual(['a', 'b']);
    expect(result.main.map((e) => e.sets)).toEqual([1, 1]);
  });

  it('picks the dropped required entry at random when an rng is given', () => {
    const slots = [
      { required: true, entry: entry('a', 3, 130) },
      { required: true, entry: entry('b', 3, 130) },
      { required: true, entry: entry('c', 3, 130) },
    ];
    const survivorSets = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const result = fitMainEntries(slots, 15, 180, 180, createRng(seed));
      expect(result.main.length).toBe(2); // still exactly one dropped, whichever it is
      for (const e of result.main) survivorSets.add(e.exerciseId);
    }
    // Across enough seeds, every one of the three should get dropped at least once — i.e. no
    // single entry is permanently favored or permanently sacrificed by its template position.
    expect(survivorSets.size).toBe(3);
  });

  it('adds optional entries until the next one would overshoot the budget', () => {
    const slots = [
      { required: true, entry: entry('req1', 3) },
      { required: false, entry: entry('opt1', 2) },
      { required: false, entry: entry('opt2', 2) },
      { required: false, entry: entry('opt3', 2) },
    ];
    // warmup 4min + cooldown 3min = 420s; main budget for 30min = 1380s, ceiling = 1518s.
    const result = fitMainEntries(slots, 30, 240, 180);
    expect(result.main.map((e) => e.exerciseId)).toEqual(['req1', 'opt1', 'opt2', 'opt3']);
  });

  it('trims an optional entry to make room once the required entry ahead of it is settled', () => {
    const slots = [
      { required: true, entry: entry('req1', 3) }, // 285s — comfortably required, kept in full
      { required: false, entry: entry('opt1', 3, 100) }, // 450s full, too big alongside req1
    ];
    const result = fitMainEntries(slots, 15, 180, 180); // budget = (15-3-3)*60=540s, ceiling=594s
    expect(result.main.map((e) => e.exerciseId)).toEqual(['req1', 'opt1']);
    expect(result.main.map((e) => e.sets)).toEqual([3, 1]); // opt1 trimmed to its 1-set floor
  });

  it('reports the exercise-count sanity check from §5.6', () => {
    const slots = Array.from({ length: 6 }, (_, i) => ({
      required: true,
      entry: entry(`e${i}`, 1),
    }));
    const result = fitMainEntries(slots, 30, 240, 180); // 30min expects 5-6 exercises
    expect(result.withinExerciseCountSanity).toBe(true);
  });

  it('reports whether the total estimate lands within +/-10% of target', () => {
    const slots = [{ required: true, entry: entry('solo', 3, 390) }]; // sets*(30+390)+60 = 1320s
    const result = fitMainEntries(slots, 30, 240, 180); // total = 4+3+23 = 30min exactly
    expect(result.withinTenPercent).toBe(true);
  });
});
