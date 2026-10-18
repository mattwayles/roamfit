/**
 * Track 37a — Settings → Limitations. Every tick saves immediately (`usersRepo.setLimitationChoices`)
 * and reaches the next generation, swap and add-exercise through the engine's injury hard filter.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { LimitationPicker } from '../components/LimitationPicker';
import { space } from '../theme';
import { Screen, Txt } from '../ui';

export default function LimitationsScreen(): React.JSX.Element {
  const { db } = useStore();
  const [selected, setSelected] = useState<string[]>(() =>
    usersRepo.ensureUser(db, nowUtcInstant()).limitationChoices.map((c) => c.id),
  );

  const save = useCallback(
    (next: string[]) => {
      usersRepo.setLimitationChoices(db, next, nowEngineClock().today, nowUtcInstant());
      setSelected(next);
    },
    [db],
  );

  return (
    <Screen scroll testID="limitations-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Limitations
      </Txt>
      <Txt variant="body" color="text2">
        Tell Wanderlift what to work around. Changes apply to the next workout you build.
      </Txt>
      <LimitationPicker selected={selected} onChange={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, gap: space.xl },
});
