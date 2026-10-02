/**
 * Circular icon button, 36pt (`sm`, the workout's top bar), 44pt (`md`), 56pt (`lg`) or 64pt (`xl`, the workout's rep -/+), with an optional caption underneath (the
 * workout's Undo / Swap / Skip row). `accessibilityLabel` is required — an icon alone says nothing.
 */
import React from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { HapticKind } from '../lib/haptics';
import { makeStyles, type ColorName } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `filled` = `surface2` disc; `plain` = bare icon (headers). */
  variant?: 'filled' | 'plain';
  /** Icon color token. */
  tone?: ColorName;
  /** Small caption below the disc. */
  label?: string;
  disabled?: boolean;
  /** Toggle state for VoiceOver (e.g. `{ selected }` on a favorite heart). */
  accessibilityState?: AccessibilityState;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DIAMETER = { sm: 36, md: 44, lg: 56, xl: 64 } as const;
const GLYPH = { sm: 18, md: 22, lg: 28, xl: 32 } as const;

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 'md',
  variant = 'filled',
  tone = 'text',
  label,
  disabled,
  accessibilityState,
  haptic,
  style,
  testID,
}: IconButtonProps): React.JSX.Element {
  const styles = useStyles();
  const d = DIAMETER[size];
  const button = (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={
        accessibilityState ? { ...accessibilityState, disabled: disabled || undefined } : undefined
      }
      hitSlop={8}
      style={[
        styles.disc,
        { width: d, height: d, borderRadius: d / 2 },
        variant === 'filled' && styles.filled,
        disabled && styles.disabled,
        !label && style,
      ]}
    >
      <Icon name={icon} size={GLYPH[size]} color={tone} />
    </PressableScale>
  );
  if (!label) return button;
  return (
    <View style={[styles.column, style]}>
      {button}
      <Txt variant="caption" color="text2" style={styles.caption} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    disc: { alignItems: 'center', justifyContent: 'center' },
    filled: {
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    disabled: { opacity: 0.4 },
    column: { alignItems: 'center' },
    caption: { marginTop: 6 },
  }),
);
