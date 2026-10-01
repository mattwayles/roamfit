import { fitFontSize, fitsAt, lineWidth, type FitTextInput } from './fitText';
import { fontWidths } from './fontMetrics';
import { type } from './typography';

const hero = (text: string, extra: Partial<FitTextInput> = {}): FitTextInput => ({
  text,
  fontFamily: type.hero.fontFamily,
  fontSize: type.hero.fontSize,
  tabular: true,
  ...extra,
});

describe('fontMetrics (generated from the TTFs)', () => {
  it('covers every font a fitted variant uses, with tabular digits all one width', () => {
    for (const v of [type.mega, type.hero, type.display, type.h2, type.eyebrow]) {
      const w = fontWidths[v.fontFamily]!;
      expect(w).toBeDefined();
      const digits = new Set('0123456789'.split('').map((d) => w.tabular[d]));
      expect(digits.size).toBe(1);
    }
  });
});

describe('lineWidth', () => {
  it('sums real advance widths: tabular digits are 0.52em in Barlow Condensed ExtraBold', () => {
    expect(lineWidth(hero('10'), 64)).toBeCloseTo(2 * 0.52 * 64, 5);
    // Proportional "1" is far narrower than its tabular form.
    expect(lineWidth(hero('1', { tabular: false }), 64)).toBeLessThan(lineWidth(hero('1'), 64)!);
  });

  it('applies uppercase, proportional letterSpacing and the Dynamic Type scale', () => {
    const base = hero('ab', { tabular: false });
    expect(lineWidth({ ...base, uppercase: true }, 64)).not.toBe(lineWidth(base, 64));
    const tracked = { ...base, letterSpacing: 2 };
    expect(lineWidth(tracked, 64)! - lineWidth(base, 64)!).toBeCloseTo(4, 5);
    expect(lineWidth(tracked, 32)! - lineWidth(base, 32)!).toBeCloseTo(2, 5);
    expect(lineWidth({ ...base, fontScale: 1.3 }, 64)).toBeCloseTo(lineWidth(base, 64)! * 1.3, 5);
  });

  it('is null for a font it has no metrics for', () => {
    expect(lineWidth(hero('1', { fontFamily: 'Nope' }), 64)).toBeNull();
  });
});

describe('fitFontSize', () => {
  it('keeps the full size when the text already fits', () => {
    expect(fitFontSize(hero('12'), 200, 1, 0.5)).toBe(64);
  });

  it('shrinks to the largest size that fits (the Journey tile: "1240" minutes in ~88pt)', () => {
    const size = fitFontSize(hero('1240'), 88, 1, 0.5);
    expect(size).toBeLessThan(64);
    expect(size).toBeGreaterThanOrEqual(32);
    expect(lineWidth(hero('1240'), size)).toBeLessThanOrEqual(88);
    expect(lineWidth(hero('1240'), size + 0.5)).toBeGreaterThan(88);
  });

  it('never goes below the floor, however narrow (the 4pt bug)', () => {
    expect(fitFontSize(hero('123456'), 10, 1, 0.5)).toBe(32);
    expect(fitFontSize(hero('123456'), 10, 1, 0.6)).toBeCloseTo(38.4, 5);
  });

  it('wraps on spaces across numberOfLines', () => {
    const title = {
      text: 'Upper body',
      fontFamily: type.display.fontFamily,
      fontSize: type.display.fontSize,
      uppercase: true,
    };
    const oneLine = lineWidth(title, 40)!;
    expect(fitsAt(title, 40, oneLine * 0.7, 1)).toBe(false);
    expect(fitsAt(title, 40, oneLine * 0.7, 2)).toBe(true);
    expect(fitFontSize(title, oneLine * 0.7, 2, 0.5)).toBe(40);
    // A single word wider than a line cannot wrap away.
    expect(fitsAt({ ...title, text: 'Upperbody' }, 40, oneLine * 0.7, 2)).toBe(false);
  });

  it('leaves an unmeasured font at its size', () => {
    expect(fitFontSize(hero('123456', { fontFamily: 'Nope' }), 10, 1, 0.5)).toBe(64);
  });
});
