/**
 * Surface container. `plain` = `surface` + 1px `line` border; `hero` = gradient fill + a seeded
 * TopoPattern (borderless); `accent` = 2px gradient border around a `surface` body. Give it
 * `onPress` and it becomes a `PressableScale` target. `plain` and `accent` lift with the theme's
 * `elevation.card` (a soft shadow in Daybreak, nothing on dark); `hero` clips, so it cannot cast one.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  makeStyles,
  radius,
  space,
  useTheme,
  type AccentName,
  type GradientColors,
} from '../theme';
import { Gradient } from './Gradient';
import { PressableScale } from './PressableScale';
import { TopoPattern } from './TopoPattern';

export type CardVariant = 'plain' | 'hero' | 'accent';

export interface CardProps {
  variant?: CardVariant;
  /** Gradient for `hero` (default trail) and `accent` (default trail) variants. */
  gradient?: GradientColors;
  /** Shortcut for `gradient`: use the gradient of an accent (teal, gold, periwinkle, summit). */
  tone?: AccentName;
  /** Topo seed for `hero`. */
  seed?: string;
  /** Inner padding; `none` for cards that lay out edge-to-edge content. */
  padding?: 'none' | 'md' | 'lg';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

const PADDING = { none: 0, md: space.lg, lg: space.xl } as const;
const BORDER = 2;

export function Card({
  variant = 'plain',
  gradient,
  tone,
  seed = 'roamfit',
  padding = 'lg',
  onPress,
  style,
  testID,
  accessibilityLabel,
  children,
}: CardProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const colorsForGradient =
    gradient ?? (tone && theme.accentGradient[tone]) ?? theme.gradients.trail;
  const pad = PADDING[padding];

  let body: React.ReactNode;
  let containerStyle: StyleProp<ViewStyle>;

  if (variant === 'hero') {
    containerStyle = [styles.base, { padding: pad }];
    body = (
      <>
        <Gradient colors={colorsForGradient} radius={radius.lg} />
        <TopoPattern seed={seed} />
        {children}
      </>
    );
  } else if (variant === 'accent') {
    containerStyle = [styles.base, styles.lifted, { padding: BORDER }];
    body = (
      <>
        <Gradient colors={colorsForGradient} radius={radius.lg} />
        <View style={[styles.accentInner, { padding: pad }]}>{children}</View>
      </>
    );
  } else {
    containerStyle = [styles.base, styles.plain, { padding: pad }];
    body = children;
  }

  const clip = variant === 'hero' ? styles.clipHero : undefined;

  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={[containerStyle, clip, style]}
      >
        {body}
      </PressableScale>
    );
  }
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[containerStyle, clip, style]}
    >
      {body}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    base: { borderRadius: radius.lg },
    lifted: t.elevation.card,
    plain: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      ...t.elevation.card,
    },
    accentInner: {
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg - BORDER,
    },
    clipHero: { overflow: 'hidden' },
  }),
);
