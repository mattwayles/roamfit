/**
 * Press feedback for anything tappable: scales to 0.96 in 90ms, springs back, and fires a
 * selection haptic on press (DESIGN.md §2 motion). Style goes on the pressable itself so the
 * whole element — padding, border, glow — is the hit area and scales as one.
 */
import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { haptics, type HapticKind } from '../lib/haptics';
import { motion } from '../theme';

const APressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Haptic on press; `false` for none. Defaults to a selection tick. */
  haptic?: HapticKind | false;
  scaleTo?: number;
}

export function PressableScale({
  style,
  haptic = 'selection',
  scaleTo = motion.press.scale,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  children,
  accessibilityRole,
  ...rest
}: PressableScaleProps): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <APressable
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
      accessibilityState={disabled ? { disabled: true } : undefined}
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        Animated.timing(scale, {
          toValue: scaleTo,
          duration: motion.press.duration,
          useNativeDriver: true,
        }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, {
          toValue: 1,
          speed: motion.spring.speed,
          bounciness: motion.spring.bounciness,
          useNativeDriver: true,
        }).start();
        onPressOut?.(e);
      }}
      onPress={
        onPress
          ? (e) => {
              if (haptic) haptics[haptic]();
              onPress(e);
            }
          : undefined
      }
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </APressable>
  );
}
