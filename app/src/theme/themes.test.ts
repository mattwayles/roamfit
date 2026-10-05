import {
  accentNames,
  buildTheme,
  daybreak,
  daybreakGradients,
  daybreakTheme,
  midnight,
  midnightGradients,
  midnightTheme,
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
/** `hex` at `alpha` laid over the opaque `base`, as an opaque hex. */
function composite(hex: string, alpha: number, base: string): string {
  const ch = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [a, b] = [ch(hex), ch(base)];
  const mixed = a.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]!));
  return '#' + mixed.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Max - min channel: a cheap colorfulness measure (0 = grey). */
function chroma(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...ch) - Math.min(...ch);
}

/** Hue in degrees (0..360) of a `#RRGGBB`. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

describe('palettes', () => {
  it('have identical key sets', () => {
    expect(Object.keys(daybreak).sort()).toEqual(Object.keys(midnight).sort());
  });

  it('Midnight values are unchanged ', () => {
    expect(midnightTheme.colors).toEqual(midnight);
    expect(midnight).toMatchObject({
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
      teal: '#4FB8C4',
      tealDeep: '#2E8C98',
      gold: '#FFB938',
      sun: '#FFD166',
      coral: '#FF8A5C',
      sky: '#5AA9FF',
      summit: '#C77DFF',
      rose: '#FF5C93',
    });
    expect(midnightTheme.gradients).toEqual({
      trail: ['#3FA9B6', '#62CBD5'],
      golden: ['#FFB938', '#FFD166'],
      coral: ['#F07040', '#FFA27A'],
      summit: ['#A45CF0', '#D59BFF'],
      night: ['#1C2330', '#0B0E13'],
    });
    expect(midnightTheme.tints.teal).toBe('rgba(79,184,196,0.15)');
  });

  it('Daybreak values match DESIGN.md §8', () => {
    expect(daybreak).toMatchObject({
      bg: '#F6F0E4',
      surface: '#FFFDF8',
      text: '#1A130C',
      ink: '#FFFFFF',
      teal: '#004C54',
      gold: '#8F5A00',
      backdrop: 'rgba(26,19,12,0.40)',
    });
    expect(daybreakGradients.trail).toEqual(['#003F46', '#0A5C66']);
  });

  it('fixedInk / fixedPaper / vivid are mode-invariant', () => {
    expect(daybreak.fixedInk).toBe(midnight.fixedInk);
    expect(daybreak.fixedPaper).toBe(midnight.fixedPaper);
    expect(daybreakTheme.vivid).toBe(midnightTheme.vivid);
    for (const n of accentNames) expect(vivid[n]).toBe(midnight[n]);
  });
});

describe('Daybreak contrast (WCAG)', () => {
  const grounds: (keyof Palette)[] = ['bg', 'surface', 'surface2'];

  it('text >= 7 and text2 >= 7 on bg', () => {
    expect(contrast(daybreak.text, daybreak.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(daybreak.text2, daybreak.bg)).toBeGreaterThanOrEqual(7);
  });

  it('text3 >= 4.5 on bg, surface and surface2', () => {
    for (const g of grounds) {
      expect(contrast(daybreak.text3, daybreak[g])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every accent except sun >= 4.5 on bg and surface; sun >= 3', () => {
    for (const n of accentNames) {
      for (const g of ['bg', 'surface'] as const) {
        const ratio = contrast(daybreak[n], daybreak[g]);
        expect(ratio).toBeGreaterThanOrEqual(n === 'sun' ? 3 : 4.5);
      }
    }
  });

  it('ink (white) >= 4.5 on every accent fill except sun', () => {
    for (const n of accentNames) {
      if (n === 'sun') continue;
      expect(contrast(daybreak.ink, daybreak[n])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('white >= 4.2 on every Daybreak gradient stop except the paper sheen', () => {
    for (const [name, stops] of Object.entries(daybreakGradients)) {
      if (name === 'night') continue;
      for (const s of stops) expect(contrast('#FFFFFF', s)).toBeGreaterThanOrEqual(4.2);
    }
  });
});

describe('Midnight contrast is not regressed', () => {
  it('ink is legible on the bright accents it sits on', () => {
    for (const n of ['teal', 'gold', 'coral'] as const) {
      expect(contrast(midnight.ink, midnight[n])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('accent hues stay apart', () => {
  // The six hues a screen shows side by side. gold and sun are one family on purpose, so sun is
  // left out. Teal, sky, plum (summit), coral, gold and rose must each be >= 20 degrees from the rest.
  const spread = ['teal', 'sky', 'summit', 'coral', 'gold', 'rose'] as const;
  it.each([
    ['Midnight', midnight],
    ['Daybreak', daybreak],
  ] as const)('%s: every pair of teal/sky/summit/coral/gold/rose is >= 20 degrees apart', (_n, p) => {
    for (let i = 0; i < spread.length; i++) {
      for (let k = i + 1; k < spread.length; k++) {
        const a = spread[i]!;
        const b = spread[k]!;
        expect([a, b, hueDistance(p[a], p[b]) >= 20]).toEqual([a, b, true]);
      }
    }
  });
});

describe('buildTheme', () => {
  it('builds two cached, frozen instances', () => {
    expect(themeFor('dark')).toBe(midnightTheme);
    expect(themeFor('light')).toBe(daybreakTheme);
    expect(Object.isFrozen(midnightTheme)).toBe(true);
    expect(buildTheme('dark').colors).toEqual(midnightTheme.colors);
  });

  it('tints are each accent at 15% alpha on Midnight, 8% on Daybreak', () => {
    for (const n of accentNames) {
      expect(midnightTheme.tints[n]).toBe(withAlpha(midnight[n], 0.15));
      expect(daybreakTheme.tints[n]).toBe(withAlpha(daybreak[n], 0.08));
    }
  });

  it('Daybreak accent text on its own tint holds contrast over surface and bg', () => {
    for (const n of accentNames) {
      for (const base of [daybreak.surface, daybreak.bg]) {
        const floor = n === 'sun' ? 3 : 4.5;
        expect(contrast(daybreak[n], composite(daybreak[n], 0.08, base))).toBeGreaterThanOrEqual(
          floor,
        );
      }
    }
  });

  it('dayCell: Midnight washes the accent itself; Daybreak fills with the vivid hue', () => {
    for (const n of accentNames) {
      expect(midnightTheme.dayCell[n]).toEqual({
        fill: withAlpha(midnight[n], 0.2),
        border: withAlpha(midnight[n], 0.55),
      });
      expect(daybreakTheme.dayCell[n]).toEqual({
        fill: withAlpha(vivid[n], 0.4),
        border: withAlpha(daybreak[n], 0.7),
      });
    }
  });

  it('Daybreak day cells read as color, not a muddy wash, and keep the date legible', () => {
    // Every accent a day marker can resolve to (focus colors, travel = sky, quick = gold).
    const markerAccents = ['teal', 'summit', 'gold', 'coral', 'rose', 'sky'] as const;
    for (const n of markerAccents) {
      const cell = composite(vivid[n], 0.4, daybreak.surface);
      // Clearly more colorful than the old deep-accent 20% wash it replaces.
      expect(chroma(cell)).toBeGreaterThan(chroma(composite(daybreak[n], 0.2, daybreak.surface)));
      expect(chroma(cell)).toBeGreaterThanOrEqual(40);
      expect(contrast(daybreak.text, cell)).toBeGreaterThanOrEqual(7);
    }
  });

  it('semantic maps resolve per palette', () => {
    expect(daybreakTheme.section.main).toBe(daybreak.teal);
    expect(daybreakTheme.trainedColor('legs')).toBe(daybreak.summit);
    expect(daybreakTheme.trainedColor(undefined)).toBe(daybreak.teal);
    expect(midnightTheme.setState.skipped).toBe(midnight.text3);
    expect(daybreakTheme.dayMarker.travel).toBe(daybreak.sky);
    expect(daybreakTheme.accentGradient.teal).toBe(daybreakTheme.gradients.trail);
    expect(midnightTheme.gradients).toEqual(midnightGradients);
  });

  it('heroCta: sun on Midnight, deep teal on Daybreak', () => {
    expect(midnightTheme.heroCta).toBe('sun');
    expect(daybreakTheme.heroCta).toBe('teal');
  });

  it('onGradient: always ink (near-black on Midnight, white on Daybreak), plum included', () => {
    expect(midnightTheme.onGradient('summit')).toBe('ink');
    expect(midnightTheme.onGradient('teal')).toBe('ink');
    expect(daybreakTheme.onGradient('summit')).toBe('ink');
  });

  it('glow is the original in Midnight and tamed in Daybreak', () => {
    expect(midnightTheme.glow()).toEqual({
      shadowColor: midnight.teal,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    });
    expect(midnightTheme.glow(midnight.gold)).toMatchObject({
      shadowColor: midnight.gold,
      shadowOpacity: 0.45,
      shadowRadius: 18,
    });
    expect(daybreakTheme.glow()).toEqual({
      shadowColor: daybreak.teal,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    });
  });

  it('elevation, topo and stamp follow §8.3', () => {
    expect(midnightTheme.elevation.card).toEqual({});
    expect(daybreakTheme.elevation.card).toEqual({
      shadowColor: '#5A4126',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    });
    expect(midnightTheme.topo).toEqual({ color: midnight.text, strength: 1 });
    expect(daybreakTheme.topo).toEqual({ color: '#3B2410', strength: 1.3 });
    expect(midnightTheme.stamp).toEqual({
      fill: midnight.sun,
      shadow: midnight.tealDeep,
      glow: midnight.teal,
    });
    expect(daybreakTheme.stamp).toEqual({ fill: daybreak.teal, shadow: vivid.gold, glow: null });
  });

  it('native chrome follows the theme', () => {
    expect(midnightTheme.statusBar).toBe('light');
    expect(daybreakTheme.statusBar).toBe('dark');
    expect(midnightTheme.navTheme.dark).toBe(true);
    expect(daybreakTheme.navTheme.dark).toBe(false);
    expect(daybreakTheme.navTheme.colors.background).toBe(daybreak.bg);
    expect(daybreakTheme.headerOptions.headerStyle.backgroundColor).toBe(daybreak.bg);
    expect(daybreakTheme.headerOptions.headerTintColor).toBe(daybreak.text);
    expect(midnightTheme.headerOptions.headerTitleStyle.color).toBe(midnight.text);
  });
});
