import { familyLibrary } from '@roamfit/data';
import { placeOnLadders } from './placement';

const families = familyLibrary.families;
const index = (familyId: string, levelId: string) =>
  families.find((f) => f.id === familyId)!.levels.findIndex((l) => l.level_id === levelId);

describe('placeOnLadders (track 37g)', () => {
  it('new to training starts every ladder at level 1', () => {
    const levels = placeOnLadders(families, { experience: 'new' });
    for (const f of families) expect(levels[f.id]).toBe(f.levels[0].level_id);
  });

  it('more experience never starts a ladder lower', () => {
    const order = ['new', 'returning', 'regular', 'advanced'] as const;
    for (const f of families) {
      const idx = order.map((experience) =>
        index(f.id, placeOnLadders(families, { experience })[f.id]),
      );
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
      expect(idx[3]).toBeLessThan(f.levels.length);
    }
  });

  it('an answer overrides its own ladder only; "Not sure" and unknown answers do not', () => {
    const base = placeOnLadders(families, { experience: 'regular' });
    const placed = placeOnLadders(families, {
      experience: 'regular',
      answers: { push_ups: 'many', squats: 'unsure', plank: 'bogus' },
    });
    expect(placed.horizontal_push).toBe('horizontal_push.l6');
    expect(placed.squat).toBe(base.squat);
    expect(placed.anti_extension).toBe(base.anti_extension);
    expect(placed.lunge).toBe(base.lunge);
  });

  it('a beginner answer can place a ladder below the experience level', () => {
    const placed = placeOnLadders(families, {
      experience: 'advanced',
      answers: { pull_ups: 'none' },
    });
    expect(placed.vertical_pull).toBe('vertical_pull.l1');
  });
});
