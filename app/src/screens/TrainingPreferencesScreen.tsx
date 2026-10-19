/**
 * Track 37f — Settings → Training → Training preferences. Every choice saves immediately and shapes
 * the next workout built; nothing about past workouts or ladder progress is rewritten. There is no
 * days-per-week setting (removed in Track 40): nothing in the app counts days against a target.
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
import { makeStyles, space } from '../theme';
import { Screen, Txt } from '../ui';

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
