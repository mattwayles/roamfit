/**
 * Track 44b - the top of the Badges page: the newest earned badge large (or, before the first,
 * a warm pointer at the one to go for), the count, four category patches that jump to their
 * section, and a tally of earned badges by tier.
 *
 * Never punish (invariant 4): only what is earned is counted; a fresh user is invited, not
 * shown an empty total.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BadgeCategory, BadgeTier } from '@roamfit/engine';
import { makeStyles, radius, space, useTheme } from '../theme';
import { Card, Gradient, PressableScale, TopoPattern, Txt } from '../ui';
import { formatFullLocalDate } from '../lib/sessionHistory';
import type { SectionTrails, ShelfBadge } from '../lib/badges';
import { BadgeEmblem, TIER_ACCENT } from './BadgeEmblem';

const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  summit: 'Summit',
};
const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'summit'];

export interface BadgesHeroProps {
  earnedCount: number;
  totalCount: number;
  /** Newest earned badge; null before the first. */
  latest: ShelfBadge | null;
  /** Shown when nothing is earned yet. */
  next: ShelfBadge | null;
  sections: readonly SectionTrails[];
  tally: Record<BadgeTier, number>;
  onOpenBadge: (badge: ShelfBadge) => void;
  onJump: (category: BadgeCategory) => void;
}

export function BadgesHero({
  earnedCount,
  totalCount,
  latest,
  next,
  sections,
  tally,
  onOpenBadge,
  onJump,
}: BadgesHeroProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const featured = latest ?? next;

  return (
    <Card padding="md" style={styles.card} testID="badges-hero">
      <View style={styles.decor} pointerEvents="none">
        <Gradient colors={theme.gradients.trail} radius={radius.lg} testID="badges-hero-gradient" />
        {/* Washed back so the emblem and text keep their contrast on either theme. */}
        <View style={[StyleSheet.absoluteFill, styles.wash]} />
        <TopoPattern seed="badges" testID="badges-hero-topo" />
      </View>

      {featured ? (
        <PressableScale
          testID="badges-hero-featured"
          onPress={() => onOpenBadge(featured)}
          accessibilityRole="button"
          accessibilityLabel={
            latest
              ? `Latest badge, ${featured.def.name}${featured.localDate && !featured.retroactive ? `, earned ${formatFullLocalDate(featured.localDate)}` : ''}`
              : `Your first badge to earn, ${featured.def.name}`
          }
          style={styles.featured}
        >
          <BadgeEmblem
            badge={featured}
            size={96}
            animateIn={featured.unseen}
            shimmer
            testID="badges-hero-emblem"
          />
          <View style={styles.featuredText}>
            <Txt variant="eyebrow" color="text3">
              {latest ? 'Latest badge' : 'Your first badge'}
            </Txt>
            <Txt variant="h2" numberOfLines={2} testID="badges-hero-name">
              {featured.def.name}
            </Txt>
            <Txt variant="small" color="text2" testID="badges-hero-sub">
              {latest
                ? featured.retroactive || !featured.localDate
                  ? 'Earned'
                  : `Earned ${formatFullLocalDate(featured.localDate)}`
                : featured.def.description}
            </Txt>
          </View>
        </PressableScale>
      ) : null}

      <Txt variant="bodyStrong" testID="badges-count">
        {`${earnedCount} of ${totalCount} earned`}
      </Txt>

      <View style={styles.patches}>
        {sections.map((s) => (
          <PressableScale
            key={s.category}
            testID={`badges-patch-${s.category}`}
            onPress={() => onJump(s.category)}
            accessibilityRole="button"
            accessibilityLabel={`${s.title}, ${s.earned} of ${s.total} earned`}
            accessibilityHint="Scrolls to this group"
            style={styles.patch}
          >
            <Txt variant="small" color="text2" numberOfLines={1} align="center">
              {s.title}
            </Txt>
            <Txt variant="bodyStrong" align="center">
              {`${s.earned}/${s.total}`}
            </Txt>
          </PressableScale>
        ))}
      </View>

      <View
        style={styles.tally}
        testID="badges-tally"
        accessible
        accessibilityLabel={`Earned by tier: ${TIER_ORDER.map((t) => `${tally[t]} ${TIER_LABEL[t].toLowerCase()}`).join(', ')}`}
      >
        {TIER_ORDER.map((t) => (
          <View key={t} style={styles.tallyItem}>
            <View style={[styles.tierDot, { backgroundColor: theme.colors[TIER_ACCENT[t]] }]} />
            <Txt variant="small" color="text2" testID={`badges-tally-${t}`}>
              {`${TIER_LABEL[t]} ${tally[t]}`}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { gap: space.lg },
    decor: { ...StyleSheet.absoluteFill, borderRadius: radius.lg, overflow: 'hidden' },
    wash: { backgroundColor: t.colors.surface, opacity: 0.88 },
    featured: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    featuredText: { flex: 1, gap: space.xs },
    patches: { flexDirection: 'row', gap: space.sm },
    patch: {
      flex: 1,
      gap: 2,
      paddingVertical: space.sm,
      paddingHorizontal: space.xs,
      borderRadius: 12,
      backgroundColor: t.colors.surface2,
    },
    tally: { flexDirection: 'row', justifyContent: 'space-between' },
    tallyItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    tierDot: { width: 8, height: 8, borderRadius: 4 },
  }),
);
