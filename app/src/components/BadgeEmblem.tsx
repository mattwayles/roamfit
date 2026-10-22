/**
 * Track 38c — a badge as an embroidered patch. The outline comes from the category (circle,
 * shield, hexagon, rounded square), the ring colour from the tier, and the glyph from the shared
 * `Icon` set; every colour is a theme token, so Midnight and Daybreak both work. Locked = a
 * dashed, desaturated outline with a faint glyph; hidden + locked = a "?". `showProgress` lays a
 * thin arc in the tier colour over a locked outline, as long as the badge's progress fraction
 * (nothing at 0, and never on a mystery badge, which must not give away how close it is).
 */
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import type { BadgeCategory, BadgeTier } from '@roamfit/engine';
import { useTheme, type AccentName } from '../theme';
import { Icon, Txt, iconMap, useReduceMotion, type IconName } from '../ui';
import { badgeLabel, type ShelfBadge } from '../lib/badges';
import { useSharedShimmer, useStitchIn, type StitchIn } from './badgeMotion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Any pixel size; the sheet uses 120, the grid 64, the trail rows 26-40. */
export type BadgeEmblemSize = number;

/** Ring accent per tier. Summit is always the top of a series. */
export const TIER_ACCENT: Record<BadgeTier, AccentName> = {
  bronze: 'fern',
  silver: 'sky',
  gold: 'gold',
  summit: 'summit',
};

const SHAPE_PATHS: Partial<Record<BadgeCategory, string>> = {
  climbing: 'M50 5 L88 18 V50 C88 74 70 90 50 96 C30 90 12 74 12 50 V18 Z',
};
const HEXAGON = '50,4 90,27 90,73 50,96 10,73 10,27';

/** Length of each outline's stroke path in the 100-unit viewBox, so a dash can cover a fraction
 *  of it. Measured from the shapes below; the circle and rounded square are exact. */
const PERIMETER: Record<BadgeCategory, number> = {
  showing_up: 289,
  climbing: 272.6,
  pushing: 276.6,
  exploring: 294.8,
};

/** Fraction of the outline to draw as progress: 0 for none (earned, mystery, or no progress). */
export function progressArcFraction(badge: ShelfBadge): number {
  if (badge.earned || badge.mystery || !badge.progress) return 0;
  const f = badge.progress.fraction;
  return Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0;
}

function Outline({
  category,
  fill,
  stroke,
  strokeWidth,
  dash,
  cap,
}: {
  category: BadgeCategory;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  cap?: 'round';
}): React.JSX.Element {
  const common = {
    fill,
    stroke,
    strokeWidth,
    strokeDasharray: dash,
    strokeLinecap: cap,
    strokeLinejoin: 'round' as const,
  };
  if (category === 'climbing') return <Path d={SHAPE_PATHS.climbing!} {...common} />;
  if (category === 'pushing') return <Polygon points={HEXAGON} {...common} />;
  if (category === 'exploring')
    return <Rect x={8} y={8} width={84} height={84} rx={24} {...common} />;
  return <Path d="M50 4 A46 46 0 1 1 49.99 4 Z" {...common} />;
}

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(iconMap, name);
}

export interface BadgeEmblemProps {
  badge: ShelfBadge;
  size?: BadgeEmblemSize;
  /** A NEW dot on the corner. */
  showNew?: boolean;
  /** A thin progress arc around a locked outline (see the header). */
  showProgress?: boolean;
  /** First-view reveal: the patch pops in and its glyph follows. Plays once each time this turns
   *  true; nothing at all under Reduce Motion. */
  animateIn?: boolean;
  /** A soft, slow glint across an earned summit emblem (ignored for any other badge). */
  shimmer?: boolean;
  /** Drives a diagonal highlight band across the emblem: 0 is just off the left edge, 1 just
   *  off the right. Used by `TiltSheen`; the caller owns Reduce Motion. */
  sheen?: Animated.Value;
  testID?: string;
}

export function BadgeEmblem(props: BadgeEmblemProps): React.JSX.Element {
  const shimmerWanted = !!props.shimmer && props.badge.earned && props.badge.def.tier === 'summit';
  // The Reduce Motion subscription is only paid for by emblems that can actually move.
  if (props.animateIn || shimmerWanted || props.sheen) {
    return <MotionEmblem {...props} shimmer={shimmerWanted} />;
  }
  return <EmblemBody {...props} />;
}

function MotionEmblem(props: BadgeEmblemProps): React.JSX.Element {
  const still = useReduceMotion();
  const stitch = useStitchIn(!!props.animateIn, still);
  const shimmerValue = useSharedShimmer(!!props.shimmer && !still);
  return <EmblemBody {...props} stitch={stitch} band={props.sheen ?? shimmerValue} />;
}

/** The soft band, clipped to the emblem's own outline so it never spills past the patch. */
function SheenBand({
  category,
  progress,
  id,
}: {
  category: BadgeCategory;
  progress: Animated.Value;
  id: string;
}): React.JSX.Element {
  const x = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, 120] });
  return (
    <>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Outline category={category} fill="#000" stroke="none" strokeWidth={0} />
        </ClipPath>
        <LinearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity={0} />
          <Stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <G clipPath={`url(#${id}-clip)`}>
        <G rotation={25} origin="50, 50">
          <AnimatedRect x={x} y={-40} width={26} height={180} fill={`url(#${id}-grad)`} />
        </G>
      </G>
    </>
  );
}

function EmblemBody({
  badge,
  size = 64,
  showNew = false,
  showProgress = false,
  testID,
  stitch = null,
  band = null,
}: BadgeEmblemProps & {
  stitch?: StitchIn | null;
  band?: Animated.Value | null;
}): React.JSX.Element {
  const theme = useTheme();
  const { def, earned, mystery } = badge;
  const accent = theme.colors[TIER_ACCENT[def.tier]];
  const glyph = isIconName(def.icon) ? def.icon : 'star';
  const iconSize = Math.round(size * 0.42);
  const ring = Math.max(2, size >= 120 ? 3 : 4);
  const arc = showProgress ? progressArcFraction(badge) : 0;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={badgeLabel(badge)}
      style={{ width: size, height: size }}
    >
      <Animated.View
        testID={stitch && testID ? `${testID}-stitch` : undefined}
        style={
          stitch
            ? {
                opacity: stitch.pop.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                }),
                transform: [
                  { scale: stitch.pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                ],
              }
            : undefined
        }
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {earned ? (
            <>
              <Outline
                category={def.category}
                fill={theme.tints[TIER_ACCENT[def.tier]]}
                stroke={accent}
                strokeWidth={ring * 1.6}
              />
              {/* The stitched inner line. */}
              <G transform="translate(50 50) scale(0.8) translate(-50 -50)">
                <Outline
                  category={def.category}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1.6}
                  dash="3 3"
                />
              </G>
            </>
          ) : (
            <>
              <Outline
                category={def.category}
                fill={theme.colors.surface2}
                stroke={theme.colors.lineStrong}
                strokeWidth={ring * 1.2}
                dash="6 5"
              />
              {arc > 0 ? (
                <G testID={testID ? `${testID}-arc` : undefined} opacity={0.6}>
                  <Outline
                    category={def.category}
                    fill="none"
                    stroke={accent}
                    strokeWidth={ring * 1.2}
                    dash={`${(PERIMETER[def.category] * arc).toFixed(1)} ${PERIMETER[def.category]}`}
                    cap="round"
                  />
                </G>
              ) : null}
            </>
          )}
          {band ? (
            <SheenBand category={def.category} progress={band} id={`sheen-${def.id}`} />
          ) : null}
        </Svg>
        <Animated.View
          style={[styles.glyph, stitch ? { opacity: stitch.glyph } : null]}
          pointerEvents="none"
        >
          {mystery ? (
            <Txt variant="h2" color="text3" style={{ fontSize: Math.round(size * 0.4) }}>
              ?
            </Txt>
          ) : (
            <Icon name={glyph} size={iconSize} color={earned ? TIER_ACCENT[def.tier] : 'text3'} />
          )}
        </Animated.View>
      </Animated.View>
      {showNew ? (
        <View
          testID={testID ? `${testID}-new` : undefined}
          style={[styles.dot, { backgroundColor: theme.colors.gold, borderColor: theme.colors.bg }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
