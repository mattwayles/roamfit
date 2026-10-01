/**
 * Transient floating line ("Strong set.") that rises and fades. Fires whenever `triggerKey`
 * changes while `message` is set — bump the key to show the same line again — then calls
 * `onDone`. Position it with `style` (it is absolutely positioned and never blocks touches).
 * Reduce Motion drops the rise and keeps a plain fade.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, space } from '../theme';
import { Txt } from './Txt';
import { useReduceMotion } from './useReduceMotion';

export interface ToastProps {
  message: string | null | undefined;
  triggerKey?: number | string;
  duration?: number;
  onDone?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Toast({
  message,
  triggerKey,
  duration = 1600,
  onDone,
  style,
  testID = 'toast',
}: ToastProps): React.JSX.Element | null {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!message) return;
    setShown(message);
    opacity.setValue(0);
    rise.setValue(0);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(rise, {
          toValue: reduceMotion ? 0 : 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(Math.max(duration - 420, 0)),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) {
        setShown(null);
        onDoneRef.current?.();
      }
    });
    return () => anim.stop();
  }, [triggerKey, message, duration, reduceMotion, opacity, rise]);

  if (!shown) return null;

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        style,
        {
          opacity,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, -6] }) },
          ],
        },
      ]}
    >
      <Txt variant="bodyStrong" color="text">
        {shown}
      </Txt>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      backgroundColor: t.colors.surface3,
      borderWidth: 1,
      borderColor: t.colors.lineStrong,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      paddingVertical: space.md,
      ...t.elevation.card,
    },
  }),
);
