/**
 * Track 38c — a badge as an embroidered patch. The outline comes from the category (circle,
 * shield, hexagon, rounded square), the ring colour from the tier, and the glyph from the shared
 * `Icon` set; every colour is a theme token, so Midnight and Daybreak both work. Locked = a
 * dashed, desaturated outline with a faint glyph; hidden + locked = a "?".
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Polygon, Rect } from 'react-native-svg';
import type { BadgeCategory, BadgeTier } from '@roamfit/engine';
import { useTheme, type AccentName } from '../theme';
import { Icon, Txt, iconMap, type IconName } from '../ui';
import { badgeLabel, type ShelfBadge } from '../lib/badges';

export type BadgeEmblemSize = 40 | 64 | 120;

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

function Outline({
  category,
  fill,
  stroke,
  strokeWidth,
  dash,
}: {
  category: BadgeCategory;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
}): React.JSX.Element {
  const common = {
    fill,
    stroke,
    strokeWidth,
    strokeDasharray: dash,
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
  testID?: string;
}

export function BadgeEmblem({
  badge,
  size = 64,
  showNew = false,
  testID,
}: BadgeEmblemProps): React.JSX.Element {
  const theme = useTheme();
  const { def, earned, mystery } = badge;
  const accent = theme.colors[TIER_ACCENT[def.tier]];
  const glyph = isIconName(def.icon) ? def.icon : 'star';
  const iconSize = Math.round(size * 0.42);
  const ring = Math.max(2, size >= 120 ? 3 : 4);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={badgeLabel(badge)}
      style={{ width: size, height: size }}
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
          <Outline
            category={def.category}
            fill={theme.colors.surface2}
            stroke={theme.colors.lineStrong}
            strokeWidth={ring * 1.2}
            dash="6 5"
          />
        )}
      </Svg>
      <View style={styles.glyph} pointerEvents="none">
        {mystery ? (
          <Txt variant="h2" color="text3" style={{ fontSize: Math.round(size * 0.4) }}>
            ?
          </Txt>
        ) : (
          <Icon name={glyph} size={iconSize} color={earned ? TIER_ACCENT[def.tier] : 'text3'} />
        )}
      </View>
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
