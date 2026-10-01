/** Pill toggle: ember when on, with a sliding thumb and a selection haptic on change. */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '../lib/haptics';
import { makeStyles } from '../theme';

const WIDTH = 52;
const HEIGHT = 32;
const THUMB = 26;
const PAD = (HEIGHT - THUMB) / 2;

export interface SwitchProps {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  style,
  testID,
}: SwitchProps): React.JSX.Element {
  const styles = useStyles();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: value ? 1 : 0,
      speed: 24,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptics.selection();
        onValueChange?.(!value);
      }}
      style={[styles.track, disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.on, { opacity: progress }]} />
      <Animated.View
        style={[
          styles.thumb,
          {
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, WIDTH - THUMB - PAD * 2],
                }),
              },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    track: {
      width: WIDTH,
      height: HEIGHT,
      borderRadius: HEIGHT / 2,
      backgroundColor: t.colors.surface3,
      borderWidth: 1,
      borderColor: t.colors.lineStrong,
      padding: PAD - 1,
      justifyContent: 'center',
    },
    on: {
      ...StyleSheet.absoluteFill,
      borderRadius: HEIGHT / 2,
      backgroundColor: t.colors.ember,
    },
    // Paper-white on both tracks (Daylight's `text` is ink, which would be a black thumb); the
    // card shadow keeps it distinct from the pale off-track on Daylight.
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: t.colors.fixedPaper,
      ...t.elevation.card,
    },
    disabled: { opacity: 0.5 },
  }),
);
