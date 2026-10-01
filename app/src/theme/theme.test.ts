import {
  accentNames,
  fontAssets,
  fontFamily,
  goldenHour,
  goldenHourTheme,
  type,
  upperVariants,
  withAlpha,
} from './index';

describe('theme tokens', () => {
  it('withAlpha converts hex to rgba', () => {
    expect(withAlpha('#FF6B35', 0.15)).toBe('rgba(255,107,53,0.15)');
  });

  it('every accent tint is its color at 15% alpha', () => {
    for (const name of accentNames) {
      expect(goldenHourTheme.tints[name]).toBe(withAlpha(goldenHour[name], 0.15));
    }
  });

  it('every font family the type scale uses is a loaded font asset', () => {
    const loaded = Object.keys(fontAssets);
    for (const style of Object.values(type)) expect(loaded).toContain(style.fontFamily);
    expect(loaded.sort()).toEqual(Object.values(fontFamily).sort());
  });

  it('upper variants carry textTransform uppercase, others do not', () => {
    for (const [name, style] of Object.entries(type)) {
      const isUpper = 'textTransform' in style && style.textTransform === 'uppercase';
      expect(isUpper).toBe(upperVariants.includes(name as keyof typeof type));
    }
  });

  it('semantic maps and helpers resolve', () => {
    expect(goldenHourTheme.section.main).toBe(goldenHour.ember);
    expect(goldenHourTheme.trainedColor('legs')).toBe(goldenHour.summit);
    expect(goldenHourTheme.trainedColor(undefined)).toBe(goldenHour.ember);
    expect(goldenHourTheme.glow(goldenHour.gold).shadowColor).toBe(goldenHour.gold);
  });

  it('nav theme is dark on bg', () => {
    expect(goldenHourTheme.navTheme.dark).toBe(true);
    expect(goldenHourTheme.navTheme.colors.background).toBe(goldenHour.bg);
  });
});
