/**
 * The `enter` motion: opacity 0 -> 1 and translateY 14 -> 0 on first mount, staggered by `index`
 * (45ms each). Instant under Reduce Motion.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '../theme';
import { useReduceMotion } from './useReduceMotion';

export interface EnterProps {
  index?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}

export function Enter({ index = 0, style, testID, children }: EnterProps): React.JSX.Element {
  const reduceMotion = useReduceMotion();
  const t = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      t.setValue(1);
      return;
    }
    const anim = Animated.spring(t, {
      toValue: 1,
      delay: index * motion.enter.stagger,
      speed: 14,
      bounciness: 6,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, reduceMotion, t]);

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: t,
          transform: [
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.enter.translateY, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
