/** React Navigation dark theme from tokens, so there are no white flashes between screens. */
import { DarkTheme, type Theme } from '@react-navigation/native';
import { colors } from './colors';
import { fontFamily } from './typography';

export const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: colors.ember,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.line,
    notification: colors.ember,
  },
  fonts: {
    regular: { fontFamily: fontFamily.body, fontWeight: '400' },
    medium: { fontFamily: fontFamily.bodyMedium, fontWeight: '500' },
    bold: { fontFamily: fontFamily.bodyBold, fontWeight: '700' },
    heavy: { fontFamily: fontFamily.condensedExtra, fontWeight: '800' },
  },
};
