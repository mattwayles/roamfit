import { repBasis } from './repBasis';

describe('repBasis', () => {
  it('says per side for a unilateral reps exercise', () => {
    expect(repBasis({ unilateral: true, metric: 'reps' })).toBe('per side');
  });

  it('says total for an alternating one', () => {
    expect(repBasis({ unilateral: false, alternating: true, metric: 'reps' })).toBe(
      'total, both sides',
    );
  });

  it('needs no cue otherwise, and none for timed holds or an unknown exercise', () => {
    expect(repBasis({ unilateral: false, metric: 'reps' })).toBeNull();
    expect(repBasis({ unilateral: true, metric: 'time' })).toBeNull();
    expect(repBasis({ unilateral: false, alternating: true, metric: 'time' })).toBeNull();
    expect(repBasis(undefined)).toBeNull();
  });
});
