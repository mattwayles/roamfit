/**
 * Shared header/scene options (DESIGN.md §4): headers are `bg`-colored with no hairline, title in
 * the `h2` face, `text` tint. (`bg` + no shadow rather than `headerTransparent`, so content is not
 * pushed underneath the header.)
 */
import { colors, fontFamily } from '../theme';

export const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: fontFamily.condensedBold, fontSize: 22, color: colors.text },
  headerBackButtonDisplayMode: 'minimal',
} as const;

/**
 * TEMPORARY (phase A): screens not yet migrated to the design system don't paint their own
 * background and use dark text, so they sit on the old light scene color to stay readable. Each
 * later phase deletes this for the screens it migrates (they then use the navigator's `bg`).
 */
export const LEGACY_SCENE = '#f2f2f2';
export const legacyLightScene = { sceneStyle: { backgroundColor: LEGACY_SCENE } } as const;
export const legacyLightContent = { contentStyle: { backgroundColor: LEGACY_SCENE } } as const;
