/** The Wanderlift mark, one printing per theme: neon on Midnight, deep teal on Daybreak. Both are
 *  transparent PNGs of the same size (1171x896, the glow included). Shared by the welcome screen and
 *  Today's header; the app icon and splash are built from the Midnight one by
 *  tools/build_brand_assets.py. */
import type { ImageSourcePropType } from 'react-native';
import type { Scheme } from '../theme';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro's static asset require */
const LOGO_MIDNIGHT = require('../../assets/logo-midnight.png') as ImageSourcePropType;
const LOGO_DAYBREAK = require('../../assets/logo-daybreak.png') as ImageSourcePropType;
/* eslint-enable @typescript-eslint/no-require-imports */

/** The mark for the theme in use (`useTheme().scheme`). */
export const logoFor = (scheme: Scheme): ImageSourcePropType =>
  scheme === 'dark' ? LOGO_MIDNIGHT : LOGO_DAYBREAK;

/** Width over height of the image, so any size keeps the mark in proportion. */
export const LOGO_ASPECT = 1171 / 896;
