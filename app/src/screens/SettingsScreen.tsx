/**
 * §13.3/§13.5 Settings — Wave 7. Didn't exist before this wave (carried-forward issues #20 and
 * #37 both cite "no settings screen" as the reason a real toggle couldn't be built). This screen
 * is the permanent home for:
 *
 *  - §13.3's medical disclaimer, permanently available (not just the first-launch prompt).
 *  - §13.5 privacy copy: location opt-in (city-level, one lookup at completion, strings only),
 *    health data (written, never read, never leaves the device), and freeform text sent for
 *    distillation being user content.
 *  - HealthKit write opt-in (issue #37) and notification quiet-hours (issue #20) — both were
 *    already backed by a real store column/patch with no UI to reach them.
 *  - A read-only §15 instrumentation diagnostics panel — purely local, purely a read, no network.
 *
 * No business logic lives here — every toggle is a straight `usersRepo.updateUser` patch, and the
 * diagnostics panel is a straight `instrumentationRepo.computeInstrumentationSnapshot` read.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { instrumentationRepo, progressionStateRepo, usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';

export const DISCLAIMER_TEXT =
  'RoamFit is a fitness tool, not a medical device or a substitute for professional medical ' +
  'advice. It provides no diagnosis and makes no health claims. Consult a physician before ' +
  'starting any new exercise program, especially if you are pregnant, recovering from an ' +
  'injury, or have an existing health condition. Stop immediately if you feel pain.';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section} testID={`settings-section-${title}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  const { db, library, families } = useStore();
  const [user, setUser] = useState<usersRepo.UserRecord>(() =>
    usersRepo.ensureUser(db, nowUtcInstant()),
  );
  const [snapshot, setSnapshot] = useState<instrumentationRepo.InstrumentationSnapshot | null>(
    null,
  );

  const refresh = useCallback(() => {
    setUser(usersRepo.getUser(db) ?? usersRepo.ensureUser(db, nowUtcInstant()));
  }, [db]);

  useFocusEffect(refresh);

  const toggleHealthWrite = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { healthWriteEnabled: value }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const toggleCueSounds = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { cueSoundsEnabled: value }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const toggleQuietHours = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(
        db,
        { notificationPrefs: { quietHoursEnabled: value } },
        nowUtcInstant(),
      );
      refresh();
    },
    [db, refresh],
  );

  const togglePassport = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { passportEnabled: value }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const loadDiagnostics = useCallback(() => {
    setSnapshot(instrumentationRepo.computeInstrumentationSnapshot(db));
  }, [db]);

  const resetProgressionSessions = useCallback(() => {
    Alert.alert(
      'Reset progression ladders?',
      'Every ladder goes back to 0 sessions at its current level. Your current level on each ' +
        "ladder is kept — this doesn't move anyone up or down a rung.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            progressionStateRepo.resetAllProgressionSessions(
              db,
              families,
              library.exercises,
              nowUtcInstant(),
            );
          },
        },
      ],
    );
  }, [db, families, library]);

  const quietHoursEnabled = user.notificationPrefs.quietHoursEnabled ?? true;

  const diagnosticsLines = useMemo(() => {
    if (!snapshot) return [];
    const { funnel, retention, offlineShare, explicitFeedback } = snapshot;
    return [
      `Generated ${funnel.generated} / started ${funnel.approvedOrStarted} / completed ${funnel.completed}`,
      `Dropped before start: ${funnel.droppedBeforeStart} · after start: ${funnel.droppedAfterStart}`,
      `D1 ${retention.d1 ? 'yes' : 'no'} · D7 ${retention.d7 ? 'yes' : 'no'} · D30 ${retention.d30 ? 'yes' : 'no'}`,
      offlineShare.share === null
        ? 'Offline share: no reading yet'
        : `Offline share: ${Math.round(offlineShare.share * 100)}% (n=${offlineShare.sampleSize})`,
      `Explicit feedback captured: ${Math.round(explicitFeedback.rate * 100)}% of entries`,
    ];
  }, [snapshot]);

  return (
    <ScrollView contentContainerStyle={styles.container} testID="settings-screen">
      <Section title="Medical disclaimer">
        <Text style={styles.body} testID="disclaimer-text">
          {DISCLAIMER_TEXT}
        </Text>
      </Section>

      <Section title="Privacy">
        <Text style={styles.body}>
          Location: opt-in, city-level only, resolved once when you complete a session. No
          coordinates and no continuous or background tracking — only city/country names are ever
          stored.
        </Text>
        <Text style={styles.body}>
          Health data (workout duration and estimated energy) is written to Apple Health, never read
          back, and never leaves this device.
        </Text>
        <Text style={styles.body}>
          If you add optional freeform notes, that text is your content and is sent off-device only
          to generate a short coaching summary — never stored or used for anything else.
        </Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Passport (city/country on completion)</Text>
          <Switch
            testID="toggle-passport"
            value={user.passportEnabled}
            onValueChange={togglePassport}
          />
        </View>
      </Section>

      <Section title="Apple Health">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Write workouts to Apple Health</Text>
          <Switch
            testID="toggle-healthkit-write"
            value={user.healthWriteEnabled}
            onValueChange={toggleHealthWrite}
          />
        </View>
      </Section>

      <Section title="Sounds">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Timer sounds</Text>
          <Switch
            testID="toggle-cue-sounds"
            value={user.cueSoundsEnabled}
            onValueChange={toggleCueSounds}
          />
        </View>
        <Text style={styles.body}>
          The 3-2-1 count, the halfway chime and the end-of-rest tone. They mix with whatever else
          is playing rather than pausing it. Vibration cues are unaffected either way, so a silent
          workout still tells you when a hold or a rest is up. There is also a mute button on the
          workout itself, for one session at a time.
        </Text>
      </Section>

      <Section title="Notifications">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Quiet hours (10pm–7am)</Text>
          <Switch
            testID="toggle-quiet-hours"
            value={quietHoursEnabled}
            onValueChange={toggleQuietHours}
          />
        </View>
      </Section>

      <Section title="Diagnostics">
        <Text style={styles.body} onPress={loadDiagnostics} testID="load-diagnostics">
          Tap to load on-device usage diagnostics (§15) — nothing here ever leaves this device.
        </Text>
        {diagnosticsLines.map((line) => (
          <Text key={line} style={styles.diagnosticsLine}>
            {line}
          </Text>
        ))}
      </Section>

      <Section title="Advanced">
        <Text
          style={[styles.body, styles.destructiveAction]}
          onPress={resetProgressionSessions}
          testID="reset-progression-sessions"
        >
          Reset progression ladders to 0 sessions
        </Text>
        <Text style={styles.body}>
          Restarts the session count at whatever level each ladder is currently on — it does not
          move any ladder up or down a rung.
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 18, color: '#334155' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 14, flexShrink: 1, paddingRight: 12 },
  diagnosticsLine: { fontSize: 12, color: '#64748b' },
  destructiveAction: { color: '#b91c1c', fontWeight: '600' },
});
