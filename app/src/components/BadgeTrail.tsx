/**
 * Track 44b - a badge series drawn as a short trail: earned tiers are small full emblems, the
 * next one shows its progress arc, later tiers are quiet dots. The row names the current badge
 * with neutral progress ("31 of 50"); `BadgeSeriesList` is the vertical version for the series
 * sheet, every tier with its words and date.
 *
 * Never punish (invariant 4): nothing here counts what is missing; later tiers are just dots.
 */
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { makeStyles, space, useTheme } from '../theme';
import { Icon, PressableScale, Txt } from '../ui';
import { formatFullLocalDate } from '../lib/sessionHistory';
import { progressText, type SeriesTrail, type ShelfBadge } from '../lib/badges';
import { BadgeEmblem, TIER_ACCENT } from './BadgeEmblem';

const CURRENT_SIZE = 38;
const DOT = 10;
const MIN_GAP = 6;
const MAX_EARNED = 28;
const MIN_EARNED = 16;

/** Node sizes that make the whole strip fit `width` without scrolling: earned emblems shrink
 *  (down to a floor) before anything else gives. Pure, so it is testable without layout. */
export function trailNodeSizes(
  trail: Pick<SeriesTrail, 'nodes' | 'earnedCount' | 'currentIndex'>,
  width: number,
): { earned: number; current: number; dot: number } {
  const n = trail.nodes.length;
  const hasCurrent = trail.currentIndex >= 0;
  const dots = hasCurrent ? n - trail.earnedCount - 1 : 0;
  const fixed = (hasCurrent ? CURRENT_SIZE : 0) + dots * DOT + (n - 1) * MIN_GAP;
  const room = width - fixed;
  const earned =
    trail.earnedCount === 0
      ? MAX_EARNED
      : Math.max(MIN_EARNED, Math.min(MAX_EARNED, Math.floor(room / trail.earnedCount)));
  return { earned, current: CURRENT_SIZE, dot: DOT };
}

export function trailLabel(trail: SeriesTrail): string {
  const progress = `${trail.earnedCount} of ${trail.nodes.length} earned`;
  return trail.current && trail.subtitle !== progress
    ? `${trail.title}, ${progress}, ${trail.subtitle}`
    : `${trail.title}, ${progress}`;
}

export function BadgeTrail({
  trail,
  onPress,
}: {
  trail: SeriesTrail;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const sizes = trailNodeSizes(trail, width || 260);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <PressableScale
      testID={`trail-${trail.series}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={trailLabel(trail)}
      accessibilityHint="Opens every badge in this series"
      style={styles.row}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <Txt variant="bodyStrong" numberOfLines={1} testID={`trail-${trail.series}-title`}>
              {trail.title}
            </Txt>
            {trail.nodes.some((n) => n.unseen) ? (
              <View
                testID={`trail-${trail.series}-new`}
                style={[styles.newDot, { backgroundColor: theme.colors.gold }]}
              />
            ) : null}
          </View>
          <Txt variant="small" color="text2" testID={`trail-${trail.series}-sub`}>
            {trail.subtitle}
          </Txt>
        </View>
        <Icon name="chevronRight" size={18} color="text3" />
      </View>
      <View
        style={styles.strip}
        onLayout={onLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {trail.nodes.map((node, i) => {
          const isCurrent = i === trail.currentIndex;
          const size = node.earned ? sizes.earned : isCurrent ? sizes.current : sizes.dot;
          return (
            <React.Fragment key={node.def.id}>
              {i > 0 ? (
                <View
                  style={[
                    styles.link,
                    {
                      backgroundColor: trail.nodes[i - 1]!.earned
                        ? theme.colors[TIER_ACCENT[trail.nodes[i - 1]!.def.tier]]
                        : theme.colors.line,
                    },
                  ]}
                />
              ) : null}
              <View
                testID={`trail-${trail.series}-node-${i}`}
                style={{ width: size, height: size, justifyContent: 'center' }}
              >
                {node.earned || isCurrent ? (
                  <BadgeEmblem
                    badge={node}
                    size={size}
                    showProgress={isCurrent}
                    animateIn={node.unseen}
                    shimmer
                  />
                ) : (
                  <View
                    style={[
                      styles.dot,
                      { width: size, height: size, backgroundColor: theme.colors.surface3 },
                    ]}
                  />
                )}
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </PressableScale>
  );
}

/** Row detail for one tier of the series sheet. */
function tierDetail(b: ShelfBadge): string {
  if (b.mystery) return b.def.riddle ?? 'A hidden badge - keep training and it may turn up.';
  return b.def.description;
}

/** The series sheet body: every tier down a vertical trail. Tapping one hands it to the caller
 *  (which opens the single-badge sheet). */
export function BadgeSeriesList({
  trail,
  onSelect,
}: {
  trail: SeriesTrail;
  onSelect: (badge: ShelfBadge) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View testID="trail-sheet-list">
      {trail.nodes.map((b, i) => {
        const last = i === trail.nodes.length - 1;
        const isCurrent = i === trail.currentIndex;
        return (
          <PressableScale
            key={b.def.id}
            testID={`trail-tier-${b.def.id}`}
            onPress={() => onSelect(b)}
            accessibilityRole="button"
            accessibilityLabel={`${b.mystery ? 'Hidden badge' : b.def.name}, ${b.earned ? 'earned' : b.progress && !b.mystery ? `locked, ${progressText(b.progress)}` : 'locked'}`}
            style={styles.tier}
          >
            <View style={styles.rail}>
              <BadgeEmblem badge={b} size={44} showProgress={isCurrent} showNew={b.unseen} />
              {!last ? (
                <View
                  style={[
                    styles.rung,
                    {
                      backgroundColor: b.earned
                        ? theme.colors[TIER_ACCENT[b.def.tier]]
                        : theme.colors.line,
                    },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.tierText}>
              <Txt variant="bodyStrong" color={b.earned || isCurrent ? 'text' : 'text2'}>
                {b.mystery ? 'Hidden badge' : b.def.name}
              </Txt>
              <Txt variant="small" color="text2">
                {tierDetail(b)}
              </Txt>
              {b.earned ? (
                <Txt
                  variant="small"
                  color={TIER_ACCENT[b.def.tier]}
                  testID={`trail-tier-${b.def.id}-meta`}
                >
                  {b.retroactive || !b.localDate
                    ? 'Earned'
                    : `Earned ${formatFullLocalDate(b.localDate)}`}
                </Txt>
              ) : b.progress && !b.mystery ? (
                <Txt variant="small" color="text" testID={`trail-tier-${b.def.id}-meta`}>
                  {progressText(b.progress)}
                </Txt>
              ) : null}
              {isCurrent && b.def.hint && !b.mystery ? (
                <Txt variant="small" color="text3">
                  {b.def.hint}
                </Txt>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: {
      gap: space.md,
      padding: space.lg,
      borderRadius: 16,
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.line,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    newDot: { width: 8, height: 8, borderRadius: 4 },
    headText: { flex: 1, gap: 2 },
    strip: { flexDirection: 'row', alignItems: 'center' },
    link: { flex: 1, height: 2, minWidth: MIN_GAP, borderRadius: 1 },
    dot: { borderRadius: 999, alignSelf: 'center' },
    tier: { flexDirection: 'row', gap: space.md },
    rail: { alignItems: 'center', width: 44 },
    rung: { width: 2, flex: 1, minHeight: space.lg, marginVertical: 2, borderRadius: 1 },
    tierText: { flex: 1, gap: 2, paddingBottom: space.lg },
  }),
);
