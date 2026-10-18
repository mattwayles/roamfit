import { LIMITATION_CHOICES, isLimitationChoiceId, tagsForLimitationChoices } from './limitations';

describe('limitation choices (track 37a)', () => {
  it('have unique ids, a label, a description and at least one tag each', () => {
    const ids = LIMITATION_CHOICES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of LIMITATION_CHOICES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.tags.length).toBeGreaterThan(0);
    }
  });

  it('expand to de-duplicated tags and ignore unknown ids', () => {
    expect(tagsForLimitationChoices(['knee', 'low_impact', 'retired']).sort()).toEqual([
      'knee_flexion_loaded',
      'knee_impact',
    ]);
    expect(isLimitationChoiceId('retired')).toBe(false);
    expect(tagsForLimitationChoices([])).toEqual([]);
  });

  it('pregnancy filters core pressure, impact and lying on the back or front', () => {
    expect(tagsForLimitationChoices(['pregnancy']).sort()).toEqual([
      'core_pressure',
      'knee_impact',
      'lying_prone',
      'lying_supine',
    ]);
  });
});
