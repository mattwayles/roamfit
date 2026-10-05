import {
  accentNames,
  fontAssets,
  fontFamily,
  midnight,
  midnightTheme,
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
      expect(midnightTheme.tints[name]).toBe(withAlpha(midnight[name], 0.15));
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
    expect(midnightTheme.section.main).toBe(midnight.teal);
    expect(midnightTheme.trainedColor('legs')).toBe(midnight.summit);
    expect(midnightTheme.trainedColor(undefined)).toBe(midnight.teal);
    expect(midnightTheme.glow(midnight.gold).shadowColor).toBe(midnight.gold);
  });

  it('nav theme is dark on bg', () => {
    expect(midnightTheme.navTheme.dark).toBe(true);
    expect(midnightTheme.navTheme.colors.background).toBe(midnight.bg);
  });
});
