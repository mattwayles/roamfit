/**
 * Shared header/scene options (DESIGN.md §4): headers are `bg`-colored with no hairline, title in
 * the `h2` face, `text` tint. (`bg` + no shadow rather than `headerTransparent`, so content is not
 * pushed underneath the header.)
 */
import { colors, type } from '../theme';

export const headerOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  // Token references, not literals: the native header title can't be a <Txt>, so it borrows h2's face.
  headerTitleStyle: {
    fontFamily: type.h2.fontFamily,
    fontSize: type.h2.fontSize,
    color: colors.text,
  },
  headerBackButtonDisplayMode: 'minimal',
} as const;
