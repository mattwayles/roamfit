import { familyLibrary } from './index';
import { EXPERIENCE_OPTIONS, PLACEMENT_QUESTIONS } from './placement';

describe('placement content (track 37g)', () => {
  const families = familyLibrary.families;

  it('every answer names a real rung of its own family, in rising order', () => {
    for (const q of PLACEMENT_QUESTIONS) {
      const family = families.find((f) => f.id === q.familyId)!;
      expect(family).toBeDefined();
      const indexes = q.answers
        .filter((a) => a.levelId !== null)
        .map((a) => family.levels.findIndex((l) => l.level_id === a.levelId));
      expect(indexes.every((i) => i >= 0)).toBe(true);
      expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
    }
  });

  it('every question offers "Not sure", and experience shares rise from level 1', () => {
    for (const q of PLACEMENT_QUESTIONS) {
      expect(q.answers.find((a) => a.levelId === null)?.label).toBe('Not sure');
    }
    const shares = EXPERIENCE_OPTIONS.map((o) => o.ladderShare);
    expect(shares[0]).toBe(0);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
    expect(Math.max(...shares)).toBeLessThan(1);
  });

  it('"4 to 8" chin-ups starts on the Chin-Up rung, not the harder Pull-Up', () => {
    const q = PLACEMENT_QUESTIONS.find((x) => x.id === 'pull_ups')!;
    expect(q.answers.find((a) => a.id === 'some')?.levelId).toBe('vertical_pull.l7');
  });
});
