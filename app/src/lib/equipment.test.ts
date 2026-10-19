import { SINGLE_BANDS } from '@roamfit/engine';
import { bandsToggled, effectiveAnchors, hasBands } from './equipment';

describe('Resistance bands in the equipment list', () => {
  it('toggling flips between no bands and every band', () => {
    expect(hasBands({ owned: [] })).toBe(false);
    expect(bandsToggled({ owned: [] })).toEqual({ owned: [...SINGLE_BANDS] });
    expect(bandsToggled({ owned: ['B2'] })).toEqual({ owned: [] });
  });

  it('low, mid and high anchors only count with bands; bars and benches always do', () => {
    const stored = ['anchor-low', 'anchor-high', 'pullup-bar'] as const;
    expect(effectiveAnchors(stored, false)).toEqual(['pullup-bar']);
    expect(effectiveAnchors(stored, true)).toEqual([...stored]);
  });
});
