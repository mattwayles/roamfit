/**
 * Track 37f — Settings → Training → Training preferences. Every choice saves immediately and shapes
 * the next workout built; nothing about past workouts or ladder progress is rewritten. Training days
 * per week is the existing `weekly_target`: the motivation pool's "N weeks on target" lines read it,
 * and nothing ever shows a count of missed days (invariant 4).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TrainingPreferences } from '@roamfit/engine';
import { usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { TRAINING_OPTION_GROUPS } from '../lib/trainingOptions';
import type { TrainingOptionGroup } from '../lib/trainingOptions';
import { TrainingOptionPicker } from '../components/TrainingOptionPicker';
import { Group } from '../components/SettingsList';
import { makeStyles, space } from '../theme';
import { IconButton, Screen, Txt } from '../ui';

const MIN_DAYS = 1;
const MAX_DAYS = 7;

export default function TrainingPreferencesScreen(): React.JSX.Element {
  const { db } = useStore();
  const styles = useStyles();
  const [user, setUser] = useState(() => usersRepo.ensureUser(db, nowUtcInstant()));

  const save = useCallback(
    (patch: usersRepo.UserPatch) => {
      usersRepo.updateUser(db, patch, nowUtcInstant());
      setUser(usersRepo.getUser(db)!);
    },
    [db],
  );

  const days = user.weeklyTarget;

  return (
    <Screen scroll testID="training-preferences-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Training
      </Txt>
      <Txt variant="body" color="text2">
        The recommended settings suit almost everyone starting out. Change anything, any time. Your
        progress is kept.
      </Txt>

      <Group
        title="Training days per week"
        caption="Your weekly target. Motivation reminders celebrate the weeks you reach it; a week that falls short is never mentioned."
      >
        <View style={styles.stepper} testID="pref-days">
          <IconButton
            testID="pref-days-minus"
            icon="remove"
            accessibilityLabel="One fewer training day"
            disabled={days <= MIN_DAYS}
            onPress={() => save({ weeklyTarget: Math.max(MIN_DAYS, days - 1) })}
          />
          <Txt
            variant="h2"
            style={styles.stepperValue}
            testID="pref-days-value"
            accessibilityLabel={`${days} days per week`}
          >
            {days}
          </Txt>
          <IconButton
            testID="pref-days-plus"
            icon="add"
            accessibilityLabel="One more training day"
            disabled={days >= MAX_DAYS}
            onPress={() => save({ weeklyTarget: Math.min(MAX_DAYS, days + 1) })}
          />
        </View>
      </Group>

      {TRAINING_OPTION_GROUPS.map((group) => {
        const g = group as TrainingOptionGroup<keyof TrainingPreferences>;
        return (
          <TrainingOptionPicker
            key={g.key}
            group={g}
            value={user.trainingPreferences[g.key]}
            onChange={(value) => save({ trainingPreferences: { [g.key]: value } })}
          />
        );
      })}
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    content: { paddingTop: space.sm, gap: space.xl },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.lg,
      padding: space.md,
    },
    stepperValue: { minWidth: 48, textAlign: 'center' },
  }),
);
