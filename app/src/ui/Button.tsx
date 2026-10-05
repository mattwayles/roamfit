/**
 * The app's button. `primary` is the trail-gradient CTA with a glow (one per screen);
 * `secondary` a `surface2` pill with a hairline; `ghost` an outline; `quiet` bare text.
 * Text on the gradient is `ink` (near-black on Midnight's bright teal, white on Daybreak's deep one).
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { HapticKind } from '../lib/haptics';
import { makeStyles, radius, space, useTheme, type ColorName } from '../theme';
import { Gradient } from './Gradient';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Put the icon after the label (e.g. an arrow). */
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container's width (default for `lg`). */
  fullWidth?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const HEIGHT: Record<ButtonSize, number> = { lg: 64, md: 52, sm: 40 };
const FONT: Record<ButtonSize, number> = { lg: 20, md: 17, sm: 15 };
const ICON: Record<ButtonSize, number> = { lg: 22, md: 20, sm: 16 };
const PAD: Record<ButtonSize, number> = { lg: space.xxl, md: space.xl, sm: space.lg };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight = false,
  loading = false,
  disabled = false,
  fullWidth,
  haptic,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const inactive = disabled || loading;
  const textColor: ColorName =
    variant === 'primary' ? 'ink' : variant === 'quiet' ? 'text2' : 'text';
  const stretch = fullWidth ?? size === 'lg';

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors[textColor]}
          style={iconRight ? styles.after : styles.before}
        />
      ) : icon && !iconRight ? (
        <Icon name={icon} size={ICON[size]} color={textColor} style={styles.before} />
      ) : null}
      <Txt
        variant="button"
        color={textColor}
        numberOfLines={1}
        style={{ fontSize: FONT[size], lineHeight: FONT[size] + 4 }}
      >
        {label}
      </Txt>
      {icon && iconRight && !loading ? (
        <Icon name={icon} size={ICON[size]} color={textColor} style={styles.after} />
      ) : null}
    </View>
  );

  return (
    <PressableScale
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      haptic={haptic ?? (variant === 'primary' ? 'light' : 'selection')}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        { height: HEIGHT[size], paddingHorizontal: PAD[size] },
        stretch && styles.stretch,
        variant === 'primary' && !inactive && theme.glow(theme.colors.teal),
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'quiet' && styles.quiet,
        inactive && styles.inactive,
        style,
      ]}
    >
      {variant === 'primary' ? <Gradient radius={radius.pill} /> : null}
      {content}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    base: {
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    stretch: { alignSelf: 'stretch' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    before: { marginRight: space.sm },
    after: { marginLeft: space.sm },
    secondary: {
      backgroundColor: t.colors.surface2,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.colors.line,
    },
    ghost: {
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: t.colors.lineStrong,
    },
    quiet: { backgroundColor: 'transparent' },
    inactive: { opacity: 0.5 },
  }),
);
