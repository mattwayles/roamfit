/**
 * Track 37g — Settings → Training → Starting levels: answer the placement questions again and move
 * every ladder to the rungs they choose. Confirmed in a sheet first, because it restarts each
 * ladder's progress at its new rung; "Keep my levels" is the loud, safe choice (DESIGN.md §5.11).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { placeOnLadders } from '@roamfit/engine';
import { progressionStateRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { DEFAULT_PLACEMENT, PlacementPicker } from '../components/PlacementPicker';
import type { PlacementValue } from '../components/PlacementPicker';
import { space } from '../theme';
import { Button, Screen, Sheet, Txt } from '../ui';

export default function PlacementScreen(): React.JSX.Element {
  const { db, library, families } = useStore();
  const navigation = useNavigation();
  const [value, setValue] = useState<PlacementValue>(DEFAULT_PLACEMENT);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const apply = () => {
    progressionStateRepo.applyPlacement(
      db,
      families,
      library.exercises,
      placeOnLadders(families.families, value),
      nowUtcInstant(),
    );
    setConfirmOpen(false);
    navigation.goBack();
  };

  return (
    <Screen
      scroll
      testID="placement-screen"
      contentStyle={styles.content}
      footer={
        <Button
          testID="placement-apply"
          label="Set my starting levels"
          size="lg"
          onPress={() => setConfirmOpen(true)}
        />
      }
    >
      <Txt variant="h1" accessibilityRole="header">
        Starting levels
      </Txt>
      <Txt variant="body" color="text2">
        Tell Wanderlift where you are and it will start each trail at a level that fits. If a level
        is still too easy or too hard, you can move it on Journey any time.
      </Txt>
      <PlacementPicker value={value} onChange={setValue} />

      <Sheet
        testID="placement-confirm"
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Move every trail?"
      >
        <Txt variant="small" color="text2" style={styles.sheetBody}>
          Each trail starts fresh at its new level. Your workout history and records are kept.
        </Txt>
        <View style={styles.sheetButtons}>
          <Button
            testID="placement-confirm-cancel"
            label="Keep my levels"
            onPress={() => setConfirmOpen(false)}
          />
          <Button
            testID="placement-confirm-yes"
            label="Move my trails"
            variant="secondary"
            size="md"
            fullWidth
            onPress={apply}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, gap: space.xl },
  sheetBody: { marginBottom: space.xl },
  sheetButtons: { gap: space.md },
});
