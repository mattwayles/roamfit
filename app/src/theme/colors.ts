/**
 * "Golden Hour" color tokens (docs/DESIGN.md §2). Screens use the semantic maps (`section`,
 * `focus`, `setState`, `dayMarker`), not raw accents. There is deliberately no red / error color
 * (invariant 4) — `rose` is the cardio identity only.
 */

export const colors = {
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
  /** Text ON bright accent fills (ember / gold / lagoon). Never white on ember. */
  ink: '#170B03',

  // Accents
  ember: '#FF6B35',
  emberDeep: '#E8491D',
  gold: '#FFB938',
  sun: '#FFD166',
  lagoon: '#2DD4BF',
  sky: '#5AA9FF',
  summit: '#8E7BFF',
  /** Cardio focus ONLY — never an error/negative state. */
  rose: '#FF5C93',
} as const;

export type ColorName = keyof typeof colors;

/** The accent colors — the ones that can carry a tint, a chip tone or a glow. */
export type AccentName =
  'ember' | 'emberDeep' | 'gold' | 'sun' | 'lagoon' | 'sky' | 'summit' | 'rose';

export const accentNames: readonly AccentName[] = [
  'ember',
  'emberDeep',
  'gold',
  'sun',
  'lagoon',
  'sky',
  'summit',
  'rose',
];

/** `#RRGGBB` + alpha (0..1) -> `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 15%-alpha tint of every accent — chip / badge backgrounds. `tints.ember` etc. */
export const tints: Record<AccentName, string> = {
  ember: 'rgba(255,107,53,0.15)',
  emberDeep: 'rgba(232,73,29,0.15)',
  gold: 'rgba(255,185,56,0.15)',
  sun: 'rgba(255,209,102,0.15)',
  lagoon: 'rgba(45,212,191,0.15)',
  sky: 'rgba(90,169,255,0.15)',
  summit: 'rgba(142,123,255,0.15)',
  rose: 'rgba(255,92,147,0.15)',
};

export const emberTint = tints.ember;
export const goldTint = tints.gold;
export const lagoonTint = tints.lagoon;
export const skyTint = tints.sky;
export const summitTint = tints.summit;
export const roseTint = tints.rose;

// ---- semantic maps ---------------------------------------------------------------------------

export const section = {
  warmup: colors.gold,
  main: colors.ember,
  cooldown: colors.lagoon,
} as const;

export const focus = {
  upper: colors.ember,
  legs: colors.summit,
  abs: colors.gold,
  full: colors.lagoon,
  cardio: colors.rose,
} as const;

/** Set state -> color. `skipped` is an outline only, `not_reached` a dashed `line` outline. */
export const setState = {
  completed: colors.ember,
  skipped: colors.text3,
  not_reached: colors.line,
} as const;

/** Day marker -> color. `trained` is the session's focus color, resolved via `focus`. */
export const dayMarker = {
  travel: colors.sky,
  quick: colors.gold,
} as const;

/** Resolve a `trained` day marker from a focus key (unknown keys fall back to ember). */
export function trainedColor(focusKey: string | null | undefined): string {
  return (focus as Record<string, string>)[focusKey ?? ''] ?? colors.ember;
}

// ---- gradients (rendered by ui/Gradient with react-native-svg) --------------------------------

export const gradients = {
  /** THE primary CTA + Ignition hero. 135deg. */
  sunrise: ['#FF5E3A', '#FF9F1C'],
  /** Achievements, best sets. */
  golden: ['#FFB938', '#FFD166'],
  /** Rest ring, recovery. */
  lagoon: ['#14B8A6', '#38BDF8'],
  /** Level ups, progression rings. */
  summit: ['#7B5CFF', '#C084FC'],
  /** Subtle card sheen, top -> bottom. */
  night: ['#1C2330', '#0B0E13'],
} as const;

export type GradientName = keyof typeof gradients;
export type GradientColors = readonly [string, string];

/** Gradient for an accent color (falls back to a flat two-stop of the color itself). */
export const accentGradient: Partial<Record<AccentName, GradientColors>> = {
  ember: gradients.sunrise,
  gold: gradients.golden,
  lagoon: gradients.lagoon,
  summit: gradients.summit,
};
