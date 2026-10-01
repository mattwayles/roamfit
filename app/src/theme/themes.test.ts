import {
  accentNames,
  buildTheme,
  daylight,
  daylightGradients,
  daylightTheme,
  goldenHour,
  goldenHourGradients,
  goldenHourTheme,
  themeFor,
  vivid,
  withAlpha,
  type Palette,
} from './index';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('palettes', () => {
  it('have identical key sets', () => {
    expect(Object.keys(daylight).sort()).toEqual(Object.keys(goldenHour).sort());
  });

  it('Golden Hour values are unchanged ', () => {
    expect(goldenHourTheme.colors).toEqual(goldenHour);
    expect(goldenHour).toMatchObject({
      bg: '#0B0E13',
      surface: '#141922',
      surface2: '#1C2330',
      surface3: '#263042',
      line: '#2A3342',
      lineStrong: '#3A4558',
      text: '#F7F3EA',
      text2: '#B4BCC8',
      text3: '#7C8696',
      ink: '#170B03',
      ember: '#FF6B35',
      emberDeep: '#E8491D',
      gold: '#FFB938',
      sun: '#FFD166',
      lagoon: '#2DD4BF',
      sky: '#5AA9FF',
      summit: '#8E7BFF',
      rose: '#FF5C93',
    });
    expect(goldenHourTheme.gradients).toEqual({
      sunrise: ['#FF5E3A', '#FF9F1C'],
      golden: ['#FFB938', '#FFD166'],
      lagoon: ['#14B8A6', '#38BDF8'],
      summit: ['#7B5CFF', '#C084FC'],
      night: ['#1C2330', '#0B0E13'],
    });
    expect(goldenHourTheme.tints.ember).toBe('rgba(255,107,53,0.15)');
  });

  it('Daylight values match DESIGN.md §8', () => {
    expect(daylight).toMatchObject({
      bg: '#F6F0E4',
      surface: '#FFFDF8',
      text: '#1A130C',
      ink: '#FFFFFF',
      ember: '#B83507',
      gold: '#8F5A00',
      backdrop: 'rgba(26,19,12,0.40)',
    });
    expect(daylightGradients.sunrise).toEqual(['#CC3B12', '#C95A04']);
  });

  it('fixedInk / fixedPaper / vivid are mode-invariant', () => {
    expect(daylight.fixedInk).toBe(goldenHour.fixedInk);
    expect(daylight.fixedPaper).toBe(goldenHour.fixedPaper);
    expect(daylightTheme.vivid).toBe(goldenHourTheme.vivid);
    for (const n of accentNames) expect(vivid[n]).toBe(goldenHour[n]);
  });
});

describe('Daylight contrast (WCAG)', () => {
  const grounds: (keyof Palette)[] = ['bg', 'surface', 'surface2'];

  it('text >= 7 and text2 >= 7 on bg', () => {
    expect(contrast(daylight.text, daylight.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(daylight.text2, daylight.bg)).toBeGreaterThanOrEqual(7);
  });

  it('text3 >= 4.5 on bg, surface and surface2', () => {
    for (const g of grounds) {
      expect(contrast(daylight.text3, daylight[g])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every accent except sun >= 4.5 on bg and surface; sun >= 3', () => {
    for (const n of accentNames) {
      for (const g of ['bg', 'surface'] as const) {
        const ratio = contrast(daylight[n], daylight[g]);
        expect(ratio).toBeGreaterThanOrEqual(n === 'sun' ? 3 : 4.5);
      }
    }
  });

  it('ink (white) >= 4.5 on every accent fill except sun', () => {
    for (const n of accentNames) {
      if (n === 'sun') continue;
      expect(contrast(daylight.ink, daylight[n])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('white >= 4.2 on every Daylight gradient stop except the paper sheen', () => {
    for (const [name, stops] of Object.entries(daylightGradients)) {
      if (name === 'night') continue;
      for (const s of stops) expect(contrast('#FFFFFF', s)).toBeGreaterThanOrEqual(4.2);
    }
  });
});

describe('Golden Hour contrast is not regressed', () => {
  it('ink is legible on the bright accents it sits on', () => {
    for (const n of ['ember', 'gold', 'lagoon'] as const) {
      expect(contrast(goldenHour.ink, goldenHour[n])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('buildTheme', () => {
  it('builds two cached, frozen instances', () => {
    expect(themeFor('dark')).toBe(goldenHourTheme);
    expect(themeFor('light')).toBe(daylightTheme);
    expect(Object.isFrozen(goldenHourTheme)).toBe(true);
    expect(buildTheme('dark').colors).toEqual(goldenHourTheme.colors);
  });

  it('tints are each accent at 15% alpha on Golden Hour, 8% on Daylight', () => {
    for (const n of accentNames) {
      expect(goldenHourTheme.tints[n]).toBe(withAlpha(goldenHour[n], 0.15));
      expect(daylightTheme.tints[n]).toBe(withAlpha(daylight[n], 0.08));
    }
  });

  it('Daylight accent text on its own tint holds contrast over surface and bg', () => {
    const composite = (hex: string, alpha: number, base: string): string => {
      const ch = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
      const [a, b] = [ch(hex), ch(base)];
      const mixed = a.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]!));
      return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    for (const n of accentNames) {
      for (const base of [daylight.surface, daylight.bg]) {
        const floor = n === 'sun' ? 3 : 4.5;
        expect(contrast(daylight[n], composite(daylight[n], 0.08, base))).toBeGreaterThanOrEqual(
          floor,
        );
      }
    }
  });

  it('semantic maps resolve per palette', () => {
    expect(daylightTheme.section.main).toBe(daylight.ember);
    expect(daylightTheme.trainedColor('legs')).toBe(daylight.summit);
    expect(daylightTheme.trainedColor(undefined)).toBe(daylight.ember);
    expect(goldenHourTheme.setState.skipped).toBe(goldenHour.text3);
    expect(daylightTheme.dayMarker.travel).toBe(daylight.sky);
    expect(daylightTheme.accentGradient.ember).toBe(daylightTheme.gradients.sunrise);
    expect(goldenHourTheme.gradients).toEqual(goldenHourGradients);
  });

  it('heroCta: sun on Golden Hour, deep ember on Daylight', () => {
    expect(goldenHourTheme.heroCta).toBe('sun');
    expect(daylightTheme.heroCta).toBe('ember');
  });

  it('onGradient: Golden Hour summit takes paper, everything else ink; Daylight always ink', () => {
    expect(goldenHourTheme.onGradient('summit')).toBe('fixedPaper');
    expect(goldenHourTheme.onGradient('ember')).toBe('ink');
    expect(daylightTheme.onGradient('summit')).toBe('ink');
  });

  it('glow is the original in Golden Hour and tamed in Daylight', () => {
    expect(goldenHourTheme.glow()).toEqual({
      shadowColor: goldenHour.ember,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    });
    expect(goldenHourTheme.glow(goldenHour.gold)).toMatchObject({
      shadowColor: goldenHour.gold,
      shadowOpacity: 0.45,
      shadowRadius: 18,
    });
    expect(daylightTheme.glow()).toEqual({
      shadowColor: daylight.ember,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    });
  });

  it('elevation, topo and stamp follow §8.3', () => {
    expect(goldenHourTheme.elevation.card).toEqual({});
    expect(daylightTheme.elevation.card).toEqual({
      shadowColor: '#5A4126',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    });
    expect(goldenHourTheme.topo).toEqual({ color: goldenHour.text, strength: 1 });
    expect(daylightTheme.topo).toEqual({ color: '#3B2410', strength: 1.3 });
    expect(goldenHourTheme.stamp).toEqual({
      fill: goldenHour.sun,
      shadow: goldenHour.emberDeep,
      glow: goldenHour.ember,
    });
    expect(daylightTheme.stamp).toEqual({ fill: daylight.ember, shadow: vivid.gold, glow: null });
  });

  it('native chrome follows the theme', () => {
    expect(goldenHourTheme.statusBar).toBe('light');
    expect(daylightTheme.statusBar).toBe('dark');
    expect(goldenHourTheme.navTheme.dark).toBe(true);
    expect(daylightTheme.navTheme.dark).toBe(false);
    expect(daylightTheme.navTheme.colors.background).toBe(daylight.bg);
    expect(daylightTheme.headerOptions.headerStyle.backgroundColor).toBe(daylight.bg);
    expect(daylightTheme.headerOptions.headerTintColor).toBe(daylight.text);
    expect(goldenHourTheme.headerOptions.headerTitleStyle.color).toBe(goldenHour.text);
  });
});
