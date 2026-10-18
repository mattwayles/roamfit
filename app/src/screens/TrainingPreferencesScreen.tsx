/**
 * Track 37f — Settings → Training → Training preferences. Every choice saves immediately and shapes
 * the next workout built; nothing about past workouts or ladder progress is rewritten. Training days
 * per week is the existing `weekly_target`: the motivation pool's "N weeks on target" lines read it,
 * and nothing ever shows a count of missed days (invariant 4).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { TrainingPreferences } from '@roamfit/engine';
import { usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { TRAINING_OPTION_GROUPS } from '../lib/trainingOptions';
import type { TrainingOptionGroup } from '../lib/trainingOptions';
import { TrainingOptionPicker } from '../components/TrainingOptionPicker';
import { Group } from '../components/SettingsList';
import { makeStyles, space } from '../theme';
import { Screen, Txt } from '../ui';
import { DAYS_PER_WEEK_CAPTION, DaysPerWeekStepper } from '../components/DaysPerWeekStepper';

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

  return (
    <Screen scroll testID="training-preferences-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Training
      </Txt>
      <Txt variant="body" color="text2">
        The recommended settings suit almost everyone starting out. Change anything, any time. Your
        progress is kept.
      </Txt>

      <Group title="Training days per week" caption={DAYS_PER_WEEK_CAPTION}>
        <DaysPerWeekStepper
          days={user.weeklyTarget}
          onChange={(weeklyTarget) => save({ weeklyTarget })}
        />
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
  }),
);
