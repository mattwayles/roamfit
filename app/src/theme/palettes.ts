/**
 * The two palettes (docs/DESIGN.md §2 "Midnight" and §8 "Daybreak"): same token names, only
 * the values change. `Palette` is the one shape both must satisfy — a missing key in either is a
 * compile error — and `buildTheme` turns each into a full `Theme`. Screens never import these
 * directly; they read `useTheme().colors`.
 */

export const midnight = {
  // Surfaces — night sky, bluish-black, never pure black
  bg: '#0B0E13',
  surface: '#141922',
  surface2: '#1C2330',
  surface3: '#263042',
  line: '#2A3342',
  lineStrong: '#3A4558',

  // Text — warm paper white
  text: '#F7F3EA',
  text2: '#B4BCC8',
  text3: '#7C8696',
  /** Text ON an accent fill. Near-black here (bright fills; never white on teal). */
  ink: '#170B03',
  /** Content on colors that do not change with the theme (band swatches, imagery). */
  fixedInk: '#170B03',
  fixedPaper: '#F7F3EA',
  /** Sheet scrim. */
  backdrop: 'rgba(5,7,10,0.72)',

  // Accents
  teal: '#4FB8C4',
  tealDeep: '#2E8C98',
  gold: '#FFB938',
  sun: '#FFD166',
  coral: '#FF8A5C',
  sky: '#5AA9FF',
  summit: '#C77DFF',
  /** Cardio focus ONLY — never an error/negative state. */
  rose: '#FF5C93',
} as const;

export type ColorName = keyof typeof midnight;
export type Palette = Record<ColorName, string>;

/** The accent colors — the ones that can carry a tint, a chip tone or a glow. */
export type AccentName = 'teal' | 'tealDeep' | 'gold' | 'sun' | 'coral' | 'sky' | 'summit' | 'rose';

export const accentNames: readonly AccentName[] = [
  'teal',
  'tealDeep',
  'gold',
  'sun',
  'coral',
  'sky',
  'summit',
  'rose',
];

/** Daybreak: printed trail map. Deep accents that carry a white legend; paper and ink. */
export const daybreak: Palette = {
  // Surfaces — warm map paper. Cards are lighter than the ground and lift with a shadow.
  bg: '#F6F0E4',
  surface: '#FFFDF8',
  surface2: '#EFE7D8',
  surface3: '#E3D8C4',
  line: '#D6C9B2',
  lineStrong: '#B3A288',

  // Text — printer's ink, warm not blue
  text: '#1A130C',
  text2: '#4A4036',
  text3: '#6B6052',
  /** Text ON an accent fill: white, because Daybreak's fills are deep. */
  ink: '#FFFFFF',
  fixedInk: '#170B03',
  fixedPaper: '#F7F3EA',
  backdrop: 'rgba(26,19,12,0.40)',

  // Accents — deepened so each is >= 4.5:1 as text on bg AND carries a white legend as a fill
  teal: '#004C54',
  tealDeep: '#003A40',
  /** Brass — reads as gold on paper, unlike a yellow. */
  gold: '#8F5A00',
  /** Mustard, not a lighter brass: at gold's hue it read as the same brown on paper, so it
   *  shifts toward yellow (53 degrees vs gold's 38). 4.7:1 on bg. */
  sun: '#7A6B00',
  coral: '#B04219',
  sky: '#1A5FC2',
  summit: '#7E2BB0',
  rose: '#BF1D63',
};

/** The Midnight accent hexes in both themes — decoration with no text on it (confetti, orbs,
 *  the sunburst, the stamp shadow). Deep confetti looks like dirt; vivid reads sunny on paper. */
export const vivid: Record<AccentName, string> = {
  teal: midnight.teal,
  tealDeep: midnight.tealDeep,
  gold: midnight.gold,
  sun: midnight.sun,
  coral: midnight.coral,
  sky: midnight.sky,
  summit: midnight.summit,
  rose: midnight.rose,
};

export type GradientName = 'trail' | 'golden' | 'coral' | 'summit' | 'night';
export type GradientColors = readonly [string, string];

export const midnightGradients: Record<GradientName, GradientColors> = {
  /** THE primary CTA + Ignition hero. 135deg. */
  trail: ['#3FA9B6', '#62CBD5'],
  /** Achievements, best sets. */
  golden: ['#FFB938', '#FFD166'],
  /** Rest ring, recovery. */
  coral: ['#F07040', '#FFA27A'],
  /** Level ups, progression rings. */
  summit: ['#A45CF0', '#D59BFF'],
  /** Subtle card sheen, top -> bottom. */
  night: ['#1C2330', '#0B0E13'],
};

/** Deepened in step with the accents so a white legend holds >= 4.2:1 at every stop. */
export const daybreakGradients: Record<GradientName, GradientColors> = {
  trail: ['#003F46', '#0A5C66'],
  golden: ['#8F5A00', '#A46D00'],
  coral: ['#A63C16', '#C0521F'],
  summit: ['#6A22A0', '#8E3BC4'],
  /** Card sheen: surface -> bg. */
  night: ['#FFFDF8', '#F6F0E4'],
};

/** `#RRGGBB` + alpha (0..1) -> `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
