/**
 * The Passport opt-in: ghosted sample stamps and "Turn on Passport". Shared shape of the card that
 * Journey draws today (39d swaps Journey over to this one). Turning it on is the same two steps
 * Journey does: set `passportEnabled`, then kick the location permission so the first geocode has
 * something granted to find (the queued `passport_geocode` jobs are what actually retry).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usersRepo, type Db } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { requestLocationPermission } from '../lib/geocode';
import { makeStyles, space } from '../theme';
import { Button, Card, Stamp, Txt } from '../ui';

/** Sample stamps ghosted behind the opt-in - decoration only, never the user's data. */
export const SAMPLE_STAMPS = ['Lisbon, PRT', 'Bend, OR, USA', 'Cusco, PER'] as const;

/** Turn Passport on. Fire-and-forget on the permission prompt, as on Journey. */
export function enablePassport(db: Db): void {
  usersRepo.updateUser(db, { passportEnabled: true }, nowUtcInstant());
  void requestLocationPermission();
}

export interface PassportOptInCardProps {
  /** Called after Passport is switched on (reload the data). */
  onEnabled: () => void;
  testID?: string;
}

export function PassportOptInCard({
  onEnabled,
  testID,
}: PassportOptInCardProps): React.JSX.Element {
  const { db } = useStore();
  const styles = useStyles();
  return (
    <Card testID={testID} padding="md" style={styles.card}>
      <View style={styles.samples}>
        {SAMPLE_STAMPS.map((city) => (
          <Stamp
            key={city}
            testID={`passport-sample-${city}`}
            title={city}
            seed={city}
            size={72}
            style={styles.ghost}
          />
        ))}
      </View>
      <Txt variant="bodyStrong" align="center">
        Collect a stamp for every place you train
      </Txt>
      <Button
        testID="passport-opt-in"
        label="Turn on Passport"
        size="sm"
        onPress={() => {
          enablePassport(db);
          onEnabled();
        }}
      />
    </Card>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    card: { alignItems: 'center', gap: space.md },
    samples: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
    ghost: { opacity: 0.3 },
  }),
);
