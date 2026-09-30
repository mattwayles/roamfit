import {
  accentNames,
  colors,
  fontAssets,
  fontFamily,
  glow,
  navTheme,
  section,
  tints,
  trainedColor,
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
      expect(tints[name]).toBe(withAlpha(colors[name], 0.15));
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
    expect(section.main).toBe(colors.ember);
    expect(trainedColor('legs')).toBe(colors.summit);
    expect(trainedColor(undefined)).toBe(colors.ember);
    expect(glow(colors.gold).shadowColor).toBe(colors.gold);
  });

  it('nav theme is dark on bg', () => {
    expect(navTheme.dark).toBe(true);
    expect(navTheme.colors.background).toBe(colors.bg);
  });
});
