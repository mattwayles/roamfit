import { LOGO_ASPECT, logoFor } from './brand';

describe('logoFor', () => {
  it('gives each theme its own mark', () => {
    expect(logoFor('dark')).not.toBe(logoFor('light'));
  });

  it('is stable per theme', () => {
    expect(logoFor('dark')).toBe(logoFor('dark'));
    expect(logoFor('light')).toBe(logoFor('light'));
  });

  it('keeps the proportions of the 1171x896 artwork', () => {
    expect(LOGO_ASPECT).toBeCloseTo(1171 / 896, 5);
  });
});
