/**
 * Circular icon button, 44pt (`md`), 56pt (`lg`) or 64pt (`xl`, the workout's rep -/+), with an optional caption underneath (the
 * workout's Undo / Swap / Skip row). `accessibilityLabel` is required — an icon alone says nothing.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { HapticKind } from '../lib/haptics';
import { colors, type ColorName } from '../theme';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: 'md' | 'lg' | 'xl';
  /** `filled` = `surface2` disc; `plain` = bare icon (headers). */
  variant?: 'filled' | 'plain';
  /** Icon color token. */
  tone?: ColorName;
  /** Small caption below the disc. */
  label?: string;
  disabled?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DIAMETER = { md: 44, lg: 56, xl: 64 } as const;
const GLYPH = { md: 22, lg: 28, xl: 32 } as const;

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 'md',
  variant = 'filled',
  tone = 'text',
  label,
  disabled,
  haptic,
  style,
  testID,
}: IconButtonProps): React.JSX.Element {
  const d = DIAMETER[size];
  const button = (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
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

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  filled: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  disabled: { opacity: 0.4 },
  column: { alignItems: 'center' },
  caption: { marginTop: 6 },
});
