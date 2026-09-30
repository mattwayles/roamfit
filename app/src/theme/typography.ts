/**
 * Type scale (docs/DESIGN.md §2). Barlow Condensed for display/numerals/eyebrows/buttons, Barlow
 * for body. `fontFamily` names match the keys handed to `useFonts` in `fonts.ts`; the weight is
 * baked into the family name, so no `fontWeight` is set (iOS would try to synthesize one).
 */
import type { TextStyle } from 'react-native';

export const fontFamily = {
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
  bodyBold: 'Barlow_700Bold',
  condensedBold: 'BarlowCondensed_700Bold',
  condensedExtra: 'BarlowCondensed_800ExtraBold',
} as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  /** Rep counter, rest/hold countdown. */
  mega: {
    fontFamily: fontFamily.condensedExtra,
    fontSize: 112,
    lineHeight: 112,
    fontVariant: tabular,
  },
  /** Elapsed clock, completion stats. */
  hero: {
    fontFamily: fontFamily.condensedExtra,
    fontSize: 64,
    lineHeight: 64,
    fontVariant: tabular,
  },
  /** Exercise name, screen hero titles. */
  display: {
    fontFamily: fontFamily.condensedExtra,
    fontSize: 40,
    lineHeight: 42,
    textTransform: 'uppercase',
  },
  /** Screen titles. */
  h1: {
    fontFamily: fontFamily.condensedBold,
    fontSize: 30,
    lineHeight: 34,
    textTransform: 'uppercase',
  },
  /** Card titles. */
  h2: {
    fontFamily: fontFamily.condensedBold,
    fontSize: 22,
    lineHeight: 26,
    textTransform: 'uppercase',
  },
  /** List item titles. */
  h3: { fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fontFamily.bodySemi, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fontFamily.bodyMedium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fontFamily.bodyMedium, fontSize: 12, lineHeight: 16 },
  /** Section labels, chips. */
  eyebrow: {
    fontFamily: fontFamily.condensedBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  /** Primary buttons. */
  button: {
    fontFamily: fontFamily.condensedExtra,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Variants that render uppercase (their style carries `textTransform: 'uppercase'`). */
export const upperVariants: readonly TypeVariant[] = ['display', 'h1', 'h2', 'eyebrow', 'button'];

/** Big numerals must not blow the layout under Dynamic Type (DESIGN.md §7). */
export const numeralMaxFontScale = 1.3;
