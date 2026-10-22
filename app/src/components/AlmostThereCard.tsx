/**
 * Track 44d - an "Almost there" card: emblem with its arc, neutral progress ("12 of 25"), a thin
 * progress bar and, when one ordinary workout could plausibly earn it, "Within reach today" with
 * (where a Generate setting maps directly) a one-tap pre-fill. The user still taps Generate and
 * the engine still picks every exercise (invariant 2).
 *
 * Never punish (invariant 4): progress is neutral; nothing here counts what is missing.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Button, Card, PressableScale, Txt } from '../ui';
import {
  progressFraction,
  progressText,
  withinReach,
  type ShelfBadge,
  type WithinReach,
} from '../lib/badges';
import { BadgeEmblem } from './BadgeEmblem';

export type GenerateParams = NonNullable<WithinReach['action']>['params'];

/** "Within reach today", with the one-tap Generate pre-fill when there is one. */
export function ReachRow({
  badgeId,
  reach,
  onAction,
}: {
  badgeId: string;
  reach: WithinReach;
  onAction: (params: GenerateParams) => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.reach}>
      <Txt variant="small" color="teal" testID={`badges-reach-${badgeId}`}>
        {reach.label}
      </Txt>
      {reach.action ? (
        <Button
          testID={`badges-reach-action-${badgeId}`}
          label={reach.action.label}
          variant="secondary"
          size="sm"
          onPress={() => onAction(reach.action!.params)}
        />
      ) : null}
    </View>
  );
}

export function AlmostThereCard({
  badge: b,
  onPress,
  onGenerate,
}: {
  badge: ShelfBadge;
  onPress: () => void;
  onGenerate: (params: GenerateParams) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const reach = withinReach(b);
  const progress = b.progress!;
  return (
    <Card padding="md" style={styles.card}>
      {/* Only the top row is the button, so the Generate action below stays reachable on its own
          (a pressable Card would swallow it for VoiceOver). */}
      <PressableScale
        testID={`badges-almost-${b.def.id}`}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${b.def.name}, ${progressText(progress)}${reach ? `, ${reach.label}` : ''}`}
        style={styles.top}
      >
        <BadgeEmblem badge={b} size={40} showProgress />
        <View style={styles.text}>
          <Txt variant="bodyStrong">{b.def.name}</Txt>
          <Txt variant="small" color="text2">
            {progressText(progress)}
          </Txt>
        </View>
      </PressableScale>
      <View
        style={styles.barTrack}
        testID={`badges-almost-bar-${b.def.id}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={[styles.barFill, { width: `${Math.round(progressFraction(progress) * 100)}%` }]}
        />
      </View>
      {reach ? <ReachRow badgeId={b.def.id} reach={reach} onAction={onGenerate} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    card: { gap: space.sm },
    top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    text: { gap: 2 },
    barTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: t.colors.surface2,
      overflow: 'hidden',
    },
    barFill: { height: 4, borderRadius: 2, backgroundColor: t.colors.teal },
    reach: { gap: space.xs, alignItems: 'flex-start' },
  }),
);
