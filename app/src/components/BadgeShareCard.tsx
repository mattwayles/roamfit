/**
 * The picture a badge is shared as: the patch large on the hero's trail gradient, its name, when
 * it was earned and a small Wanderlift sign-off. Rendered off-screen inside the badge sheet and
 * captured with react-native-view-shot, so it never moves (no tilt, no shimmer, no pop) and the
 * image is the same every time. Never punish (invariant 4): only an earned badge is shared.
 */
import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radius, space, useTheme } from '../theme';
import { Gradient, TopoPattern, Txt } from '../ui';
import { formatFullLocalDate } from '../lib/sessionHistory';
import type { ShelfBadge } from '../lib/badges';
import { BadgeEmblem, TIER_ACCENT } from './BadgeEmblem';

/** Square, in points; captured at the screen's pixel ratio. */
export const SHARE_CARD_SIZE = 320;

export const BadgeShareCard = forwardRef<View, { badge: ShelfBadge }>(function BadgeShareCard(
  { badge },
  ref,
) {
  const theme = useTheme();
  const styles = useStyles();
  const earnedOn =
    badge.localDate && !badge.retroactive ? formatFullLocalDate(badge.localDate) : null;

  return (
    <View ref={ref} collapsable={false} style={styles.card} testID="badge-share-card">
      <View style={styles.decor} pointerEvents="none">
        <Gradient colors={theme.gradients.trail} radius={radius.lg} />
        <View style={[StyleSheet.absoluteFill, styles.wash]} />
        <TopoPattern seed={badge.def.id} />
      </View>
      <BadgeEmblem badge={badge} size={150} />
      <View style={styles.text}>
        <Txt variant="h2" align="center">
          {badge.def.name}
        </Txt>
        <Txt variant="small" align="center" color="text2">
          {badge.def.description}
        </Txt>
        {earnedOn ? (
          <Txt variant="bodyStrong" align="center" color={TIER_ACCENT[badge.def.tier]}>
            Earned {earnedOn}
          </Txt>
        ) : null}
      </View>
      <Txt variant="eyebrow" color="text3">
        Wanderlift
      </Txt>
    </View>
  );
});

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: {
      width: SHARE_CARD_SIZE,
      height: SHARE_CARD_SIZE,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.md,
      padding: space.lg,
    },
    decor: { ...StyleSheet.absoluteFill },
    wash: { backgroundColor: t.colors.surface, opacity: 0.82 },
    text: { gap: space.xs, alignItems: 'center' },
  }),
);
