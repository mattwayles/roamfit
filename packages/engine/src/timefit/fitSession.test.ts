import { fitMainEntries } from './fitSession';
import type { SessionEntry } from '../types';

function entry(estimatedSec: number, id: string): SessionEntry {
  return {
    exerciseId: id,
    role: 'main',
    band: null,
    sets: 3,
    repTarget: 10,
    restSec: 45,
    tempoSec: 3,
    difficulty: 'medium',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: 'horizontal_push',
    anchorClass: 'none',
    unilateral: false,
    estimatedSec,
  };
}

describe('§5.1 step 6 time fit', () => {
  it('never drops a required entry', () => {
    const slots = [
      { required: true, entry: entry(600, 'a') },
      { required: true, entry: entry(600, 'b') },
      { required: true, entry: entry(600, 'c') },
    ];
    const result = fitMainEntries(slots, 15, 180, 180); // small budget, big required load
    expect(result.main.map((e) => e.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('adds optional entries until the next one would overshoot the budget', () => {
    const slots = [
      { required: true, entry: entry(300, 'req1') },
      { required: false, entry: entry(250, 'opt1') },
      { required: false, entry: entry(250, 'opt2') },
      { required: false, entry: entry(250, 'opt3') },
    ];
    // warmup 4min + cooldown 3min = 420s; main budget for 30min = 1380s.
    const result = fitMainEntries(slots, 30, 240, 180);
    expect(result.main.map((e) => e.exerciseId)).toEqual(['req1', 'opt1', 'opt2', 'opt3']);
  });

  it('stops adding once the next optional entry would exceed the +10% ceiling', () => {
    const slots = [
      { required: true, entry: entry(600, 'req1') },
      { required: false, entry: entry(900, 'opt1') }, // would blow well past budget+10%
    ];
    const result = fitMainEntries(slots, 15, 180, 180); // budget = (15-3-3)*60=540s
    expect(result.main.map((e) => e.exerciseId)).toEqual(['req1']);
  });

  it('reports the exercise-count sanity check from §5.6', () => {
    const slots = Array.from({ length: 6 }, (_, i) => ({
      required: true,
      entry: entry(200, `e${i}`),
    }));
    const result = fitMainEntries(slots, 30, 240, 180); // 30min expects 5-6 exercises
    expect(result.withinExerciseCountSanity).toBe(true);
  });

  it('reports whether the total estimate lands within +/-10% of target', () => {
    const slots = [{ required: true, entry: entry(1380, 'solo') }];
    const result = fitMainEntries(slots, 30, 240, 180); // total = 4+3+23 = 30min exactly
    expect(result.withinTenPercent).toBe(true);
  });
});
