/** Track 37i — Settings → Your bands: owned bands, names and colours, and stacking. */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { BandSetup } from '../components/BandSetup';
import { space } from '../theme';
import { Screen, Txt } from '../ui';

export default function BandsScreen(): React.JSX.Element {
  const { db } = useStore();
  const [user, setUser] = useState(() => usersRepo.ensureUser(db, nowUtcInstant()));
  const refresh = useCallback(() => setUser(usersRepo.getUser(db)!), [db]);

  return (
    <Screen scroll adjustForKeyboard testID="bands-screen" contentStyle={styles.content}>
      <Txt variant="h1" accessibilityRole="header">
        Your bands
      </Txt>
      <BandSetup
        settings={user.bandSettings}
        tensions={user.bandTensions}
        onChangeSettings={(bandSettings) => {
          usersRepo.updateUser(db, { bandSettings }, nowUtcInstant());
          refresh();
        }}
        onChangeTension={(band, patch) => {
          usersRepo.updateBandTension(db, band, patch, nowUtcInstant());
          refresh();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, gap: space.xl },
});
