/**
 * Static Golden Hour color exports (docs/DESIGN.md §2). Phase 1-2 of track 22 keep these alive so
 * unmigrated files compile; new code reads `useTheme()` / `makeStyles` (ThemeContext.tsx), and
 * these go away once the last screen is migrated. The palettes, types and helpers live in
 * `palettes.ts`; the semantic maps and gradients are built per theme in `buildTheme.ts`.
 */
import { goldenHourTheme } from './buildTheme';
import { goldenHour, type AccentName, type GradientColors } from './palettes';

/** @deprecated use useTheme() */
export const colors = goldenHour;

/** @deprecated use useTheme() */
export const tints = goldenHourTheme.tints;

/** @deprecated use useTheme() */
export const emberTint = tints.ember;
/** @deprecated use useTheme() */
export const goldTint = tints.gold;
/** @deprecated use useTheme() */
export const lagoonTint = tints.lagoon;
/** @deprecated use useTheme() */
export const skyTint = tints.sky;
/** @deprecated use useTheme() */
export const summitTint = tints.summit;
/** @deprecated use useTheme() */
export const roseTint = tints.rose;

// ---- semantic maps ---------------------------------------------------------------------------

/** @deprecated use useTheme() */
export const section = goldenHourTheme.section;

/** @deprecated use useTheme() */
export const focus = goldenHourTheme.focus;

/** @deprecated use useTheme() */
export const setState = goldenHourTheme.setState;

/** @deprecated use useTheme() */
export const dayMarker = goldenHourTheme.dayMarker;

/** @deprecated use useTheme() */
export const trainedColor = goldenHourTheme.trainedColor;

// ---- gradients (rendered by ui/Gradient with react-native-svg) --------------------------------

/** @deprecated use useTheme() */
export const gradients = goldenHourTheme.gradients;

/** @deprecated use useTheme() */
export const accentGradient: Partial<Record<AccentName, GradientColors>> =
  goldenHourTheme.accentGradient;
