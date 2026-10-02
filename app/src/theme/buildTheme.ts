/**
 * `buildTheme(scheme)` — everything a component needs to paint itself in one light: the palette,
 * tints, gradients, the semantic maps, and the depth/glow/topo/stamp rules that differ between
 * Golden Hour (dark) and Daylight (light) (docs/DESIGN.md §8). Two frozen instances are built
 * once at module load; the ThemeProvider just picks one, so `makeStyles` caches per instance.
 */
import { DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import type { ViewStyle } from 'react-native';
import {
  daylight,
  daylightGradients,
  goldenHour,
  goldenHourGradients,
  vivid,
  withAlpha,
  accentNames,
  type AccentName,
  type ColorName,
  type GradientColors,
  type GradientName,
  type Palette,
} from './palettes';
import { fontFamily, type } from './typography';

export type Scheme = 'light' | 'dark';

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  /** Golden Hour accent hexes in both themes — decoration only, never under text. */
  vivid: Record<AccentName, string>;
  /** Tint of every accent — chip / badge backgrounds. 15% alpha on Golden Hour; 8% on Daylight,
   *  where a stronger wash drags accent-text-on-tint under 4.5:1 (see theme tests). */
  tints: Record<AccentName, string>;
  gradients: Record<GradientName, GradientColors>;
  /** Gradient for an accent color (pine, gold, lagoon, summit have one). */
  accentGradient: Partial<Record<AccentName, GradientColors>>;
  section: { warmup: string; main: string; cooldown: string };
  focus: { upper: string; legs: string; abs: string; full: string; cardio: string };
  /** `skipped` is an outline only, `not_reached` a dashed `line` outline. */
  setState: { completed: string; skipped: string; not_reached: string };
  /** `trained` is the session's focus color, resolved via `trainedColor`. */
  dayMarker: { travel: string; quick: string };
  /** Calendar day-cell paint for a marker's accent (Logbook + Today's week strip). Golden Hour
   *  washes the accent itself over the night surface. Daylight's deep accents go muddy as a
   *  wash on paper, so its fill is the vivid hue instead, outlined in the deep accent. */
  dayCell: Record<AccentName, { fill: string; border: string }>;
  /** Resolve a `trained` day marker from a focus key (unknown keys fall back to pine). */
  trainedColor(focusKey: string | null | undefined): string;
  /** Token name of the legend color for text on a hero gradient of this accent tone. */
  onGradient(tone: AccentName): 'ink' | 'fixedPaper';
  /** Legend color for the Home hero pill (an `ink` fill): `sun` reads on Golden Hour's near-black;
   *  Daylight's white pill takes deep pine (sun is only 3.8:1 there). */
  heroCta: ColorName;
  /** Accent glow as iOS shadow props. Tamed in Daylight, where a big bloom reads as a smudge. */
  glow(color?: string): ViewStyle;
  /** `card` lifts Card/Sheet/StatTile/TabBar. Empty on dark (shadows vanish there). */
  elevation: { card: ViewStyle };
  /** TopoPattern ink and its multiplier on the seeded opacity. */
  topo: { color: string; strength: number };
  /** Completion headline inks; `glow: null` = no glow. */
  stamp: { fill: string; shadow: string; glow: string | null };
  statusBar: 'light' | 'dark';
  navTheme: NavTheme;
  /** Native-stack/tab header options: `bg` header, no hairline, `h2` title in `text`. */
  headerOptions: {
    headerStyle: { backgroundColor: string };
    headerShadowVisible: false;
    headerTintColor: string;
    headerTitleStyle: { fontFamily: string; fontSize: number; color: string };
    headerBackButtonDisplayMode: 'minimal';
  };
}

const navFonts: NavTheme['fonts'] = {
  regular: { fontFamily: fontFamily.body, fontWeight: '400' },
  medium: { fontFamily: fontFamily.bodyMedium, fontWeight: '500' },
  bold: { fontFamily: fontFamily.bodyBold, fontWeight: '700' },
  heavy: { fontFamily: fontFamily.condensedExtra, fontWeight: '800' },
};

export function buildTheme(scheme: Scheme): Theme {
  const dark = scheme === 'dark';
  const c: Palette = dark ? goldenHour : daylight;
  const gradients = dark ? goldenHourGradients : daylightGradients;

  const tints = Object.fromEntries(
    accentNames.map((n) => [n, withAlpha(c[n], dark ? 0.15 : 0.08)]),
  ) as Record<AccentName, string>;

  const dayCell = Object.fromEntries(
    accentNames.map((n) => [
      n,
      dark
        ? { fill: withAlpha(c[n], 0.2), border: withAlpha(c[n], 0.55) }
        : { fill: withAlpha(vivid[n], 0.4), border: withAlpha(c[n], 0.7) },
    ]),
  ) as Record<AccentName, { fill: string; border: string }>;

  const focus = { upper: c.pine, legs: c.summit, abs: c.gold, full: c.lagoon, cardio: c.rose };

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: c.pine,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.line,
      notification: c.pine,
    },
    fonts: navFonts,
  };

  return Object.freeze({
    scheme,
    colors: Object.freeze({ ...c }),
    vivid,
    tints,
    gradients,
    accentGradient: {
      pine: gradients.trail,
      gold: gradients.golden,
      lagoon: gradients.lagoon,
      summit: gradients.summit,
    },
    section: { warmup: c.gold, main: c.pine, cooldown: c.lagoon },
    focus,
    setState: { completed: c.pine, skipped: c.text3, not_reached: c.line },
    dayMarker: { travel: c.sky, quick: c.gold },
    dayCell,
    trainedColor: (focusKey) => (focus as Record<string, string>)[focusKey ?? ''] ?? c.pine,
    // Golden Hour: summit's violet hero is the one place `ink` is only 3.9:1, so it takes paper.
    // Daylight's fills are all deep enough for white.
    onGradient: (tone) => (dark && tone === 'summit' ? 'fixedPaper' : 'ink'),
    heroCta: dark ? 'sun' : 'pine',
    glow: (color = c.pine) => ({
      shadowColor: color,
      shadowOpacity: dark ? 0.45 : 0.28,
      shadowRadius: dark ? 18 : 10,
      shadowOffset: { width: 0, height: dark ? 6 : 4 },
    }),
    elevation: {
      card: dark
        ? {}
        : {
            shadowColor: '#5A4126',
            shadowOpacity: 0.1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          },
    },
    // Sepia contours read on both paper and the deep hero gradients.
    topo: dark ? { color: c.text, strength: 1 } : { color: '#3B2410', strength: 1.3 },
    stamp: dark
      ? { fill: c.sun, shadow: c.pineDeep, glow: c.pine }
      : { fill: c.pine, shadow: vivid.gold, glow: null },
    statusBar: dark ? 'light' : 'dark',
    navTheme,
    headerOptions: {
      headerStyle: { backgroundColor: c.bg },
      headerShadowVisible: false,
      headerTintColor: c.text,
      // Token references, not literals: the native header title can't be a <Txt>, so it borrows
      // h2's face.
      headerTitleStyle: {
        fontFamily: type.h2.fontFamily,
        fontSize: type.h2.fontSize,
        color: c.text,
      },
      headerBackButtonDisplayMode: 'minimal',
    },
  } satisfies Theme);
}

/** Golden Hour (dark) — the original look and the ThemeContext default. */
export const goldenHourTheme: Theme = buildTheme('dark');
/** Daylight (light). */
export const daylightTheme: Theme = buildTheme('light');

export const themeFor = (scheme: Scheme): Theme =>
  scheme === 'dark' ? goldenHourTheme : daylightTheme;
