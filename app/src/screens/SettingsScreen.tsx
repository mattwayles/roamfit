/**
 * §13.3/§13.5 Settings — a grouped, iOS-style list on `bg` (DESIGN.md §5.10), most-changed first:
 * Appearance, Training, Motivation, Travel & privacy, Apple Health, iCloud backup, the Medical disclaimer card, and the rare
 * stuff (diagnostics, reset) tucked behind an Advanced disclosure. It is the permanent home for:
 *
 *  - §13.3's medical disclaimer, permanently available (not just the first-launch prompt).
 *  - §13.5 privacy copy: location opt-in (city-level, one lookup at completion, strings only),
 *    health data (written, never read, never leaves the device), and freeform text sent for
 *    distillation being user content.
 *  - HealthKit write opt-in (issue #37), which was already backed by a real store column/patch
 *    with no UI to reach it.
 *  - A read-only §15 instrumentation diagnostics panel — purely local, purely a read, no network.
 *
 * No business logic lives here — every toggle is a straight `usersRepo.updateUser` patch, and the
 * diagnostics panel is a straight `instrumentationRepo.computeInstrumentationSnapshot` read. This
 * file is presentation only: nothing it reads or writes changed when it got its new look.
 *
 * Every boolean is the design system's `Switch`. Each `toggle-*` id sits on its *row* (tap anywhere
 * on the row), and the row's `accessibilityState.checked` is the value; the switch inside carries
 * `${id}-switch`. Tests press the row, not a native switch's `valueChange`.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { limitationSummary } from '../components/LimitationPicker';
import { trainingSummary } from '../lib/trainingOptions';
import { instrumentationRepo, progressionStateRepo, usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { requestHealthKitWritePermission } from '../lib/healthKit';
import {
  formatBackupTime,
  getBackupStatus,
  keepThisPhonesData,
  runBackup,
} from '../lib/icloudBackup';
import { KeepPhoneSheet } from '../components/KeepPhoneSheet';
import { useICloudRestore } from '../state/useICloudRestore';
import type { BackupStatus } from '../lib/icloudBackup';
import { MAX_DAILY_MOTIVATION_TIMES, dateToTime, timeToDate } from '../lib/motivationNotifications';
import { appVersionLabel } from '../lib/appInfo';
import { openFeedbackEmail } from '../lib/feedback';
import { makeStyles, radius, space } from '../theme';
import { useThemePreference } from '../state/ThemeProvider';
import type { ThemePreference } from '@roamfit/store';
import {
  Button,
  Card,
  Chip,
  Enter,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  Sheet,
  Txt,
  haptics,
  type IconName,
} from '../ui';
import { IconBadge } from '../components/IconBadge';
import { Group, IconTile, NavRow, SETTINGS_ROW_PAD, SwitchRow } from '../components/SettingsList';

const DEFAULT_MOTIVATION_TIMES = ['18:00'];

export { DISCLAIMER_TEXT } from '../lib/disclaimer';
import { DISCLAIMER_TEXT } from '../lib/disclaimer';

const ROW_PAD = SETTINGS_ROW_PAD;

const APPEARANCE_OPTIONS: {
  value: ThemePreference;
  label: string;
  testID: string;
  icon?: IconName;
}[] = [
  { value: 'system', label: 'System', testID: 'appearance-system' },
  { value: 'light', label: 'Daybreak', testID: 'appearance-light', icon: 'sun' },
  { value: 'dark', label: 'Midnight', testID: 'appearance-dark', icon: 'moon' },
];

/** The three-way theme picker: one selectable `Chip` per preference, equal width. The selected one
 *  is the stored preference (not the resolved scheme — "System" stays selected while following). */
function AppearanceControl(): React.JSX.Element {
  const styles = useStyles();
  const { preference, setPreference } = useThemePreference();
  return (
    <View style={styles.appearance} accessibilityRole="radiogroup">
      {APPEARANCE_OPTIONS.map((option) => {
        const selected = option.value === preference;
        return (
          <Chip
            key={option.value}
            testID={option.testID}
            label={option.label}
            icon={option.icon}
            tone="teal"
            selected={selected}
            style={styles.appearanceOption}
            onPress={() => {
              if (!selected) setPreference(option.value);
            }}
          />
        );
      })}
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  const { db, library, families } = useStore();
  const styles = useStyles();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [user, setUser] = useState<usersRepo.UserRecord>(() =>
    usersRepo.ensureUser(db, nowUtcInstant()),
  );
  const [snapshot, setSnapshot] = useState<instrumentationRepo.InstrumentationSnapshot | null>(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [keepOpen, setKeepOpen] = useState(false);
  const { restoring, message: restoreMessage, restore } = useICloudRestore();

  const refresh = useCallback(() => {
    setUser(usersRepo.getUser(db) ?? usersRepo.ensureUser(db, nowUtcInstant()));
  }, [db]);

  useFocusEffect(refresh);

  const refreshBackupStatus = useCallback(async () => {
    setBackupStatus(await getBackupStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getBackupStatus().then((status) => {
        if (!cancelled) setBackupStatus(status);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggleBackup = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { icloudBackupEnabled: value }, nowUtcInstant());
      setBackupNote(null);
      refresh();
    },
    [db, refresh],
  );

  const backUpNow = useCallback(async () => {
    if (backingUp) return;
    setBackingUp(true);
    setBackupNote(null);
    const outcome = await runBackup(db, { reason: 'manual' });
    if (outcome.kind === 'failed') {
      setBackupNote("Couldn't back up just now. Your data is safe here; try again in a moment.");
    }
    refresh();
    await refreshBackupStatus();
    setBackingUp(false);
  }, [backingUp, db, refresh, refreshBackupStatus]);

  const toggleHealthWrite = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { healthWriteEnabled: value }, nowUtcInstant());
      // Track 37m — turning it on is the moment to ask iOS for write access (never read access).
      // Fire-and-forget: the switch reflects the choice at once; a denial just means writes no-op.
      if (value) void requestHealthKitWritePermission();
      refresh();
    },
    [db, refresh],
  );

  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);
  const sendFeedback = useCallback(async () => {
    const opened = await openFeedbackEmail();
    setFeedbackNote(opened ? null : 'Set up Mail on this phone, then try again');
  }, []);

  const toggleCueSounds = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { cueSoundsEnabled: value }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const toggleFeedbackPrompt = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(db, { feedbackPromptEnabled: value }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const motivationTimes = user.notificationPrefs.motivationTimes ?? DEFAULT_MOTIVATION_TIMES;

  const saveMotivationTimes = useCallback(
    (times: string[]) => {
      usersRepo.updateUser(db, { notificationPrefs: { motivationTimes: times } }, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  const toggleMotivation = useCallback(
    (value: boolean) => {
      usersRepo.updateUser(
        db,
        { notificationPrefs: { motivationEnabled: value } },
        nowUtcInstant(),
      );
      refresh();
    },
    [db, refresh],
  );

  const addMotivationTime = useCallback(() => {
    if (motivationTimes.length >= MAX_DAILY_MOTIVATION_TIMES) return;
    saveMotivationTimes([...motivationTimes, '18:00']);
  }, [motivationTimes, saveMotivationTimes]);

  const removeMotivationTime = useCallback(
    (index: number) => {
      // Always leave at least one — disabling the whole feature is what the master toggle is for.
      if (motivationTimes.length <= 1) return;
      saveMotivationTimes(motivationTimes.filter((_, i) => i !== index));
    },
    [motivationTimes, saveMotivationTimes],
  );

  const setMotivationTime = useCallback(
    (index: number, event: DateTimePickerEvent, picked?: Date) => {
      if (event.type !== 'set' || !picked) return;
      saveMotivationTimes(motivationTimes.map((t, i) => (i === index ? dateToTime(picked) : t)));
    },
    [motivationTimes, saveMotivationTimes],
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
    progressionStateRepo.resetAllProgressionSessions(
      db,
      families,
      library.exercises,
      nowUtcInstant(),
    );
    setResetOpen(false);
  }, [db, families, library]);

  const motivationEnabled = user.notificationPrefs.motivationEnabled ?? true;

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

  const backupStatusLine = backingUp
    ? 'Backing up…'
    : (backupNote ??
      (backupStatus?.lastBackedUpAt != null
        ? `Last backed up: ${formatBackupTime(backupStatus.lastBackedUpAt)}`
        : 'Not backed up yet'));
  // The one-line explanation lives under the label; this only speaks up when something needs saying.
  const backupCaption = user.backupDecisionPending
    ? "A backup from another phone was found. Restore it from Advanced below, or keep this phone's data here."
    : backupStatus && !backupStatus.available
      ? "iCloud isn't available on this phone right now. Your data is safe here."
      : undefined;

  return (
    <Screen scroll testID="settings-screen" contentStyle={styles.content}>
      <Enter index={0}>
        <Txt variant="h1" accessibilityRole="header">
          Settings
        </Txt>
      </Enter>

      <Enter index={1}>
        <Group title="Appearance">
          <AppearanceControl />
        </Group>
      </Enter>

      <Enter index={2}>
        <Group title="Your body">
          <NavRow
            testID="settings-limitations"
            icon="shield"
            tone="gold"
            label="Limitations"
            value={limitationSummary(user.limitationChoices.map((c) => c.id))}
            hint="Opens the list of body areas and conditions to work around"
            onPress={() => navigation.navigate('Limitations')}
          />
        </Group>
      </Enter>

      <Enter index={3}>
        <Group title="Training">
          <NavRow
            testID="settings-training-preferences"
            icon="barbell"
            tone="teal"
            label="Training preferences"
            value={trainingSummary(user.trainingPreferences)}
            hint="Opens goal, rest, variety, recovery, pace and warm-up settings"
            onPress={() => navigation.navigate('TrainingPreferences')}
          />
          <NavRow
            testID="settings-bands"
            icon="anchor"
            tone="sky"
            label="Your bands"
            value={
              user.bandSettings.owned.length === 0
                ? 'No bands'
                : `${user.bandSettings.owned.length} of 5${user.bandSettings.stacking ? ' · stacking' : ''}`
            }
            hint="Opens which bands you own, their names and colours, and stacking"
            onPress={() => navigation.navigate('Bands')}
          />
          <SwitchRow
            testID="toggle-cue-sounds"
            icon="volume"
            tone="gold"
            label="Timer sounds"
            value={user.cueSoundsEnabled}
            onValueChange={toggleCueSounds}
          />
          <SwitchRow
            testID="toggle-feedback-prompt"
            icon="sparkles"
            tone="teal"
            label="Ask how each exercise felt"
            value={user.feedbackPromptEnabled}
            onValueChange={toggleFeedbackPrompt}
          />
        </Group>
      </Enter>

      <Enter index={4}>
        <Group title="Motivation" subtitle="Push notifications to help get you going">
          <SwitchRow
            testID="toggle-motivation"
            icon="sparkles"
            tone="teal"
            label="Daily motivation"
            value={motivationEnabled}
            onValueChange={toggleMotivation}
          />
          {motivationEnabled ? (
            <View style={styles.times} testID="motivation-times">
              {motivationTimes.map((time, index) => (
                <View key={index} style={styles.timeRow} testID={`motivation-time-row-${index}`}>
                  <Txt variant="bodyStrong">
                    {motivationTimes.length > 1 ? `Time ${index + 1}` : 'Time'}
                  </Txt>
                  <DateTimePicker
                    testID={`motivation-time-${index}-picker`}
                    mode="time"
                    display="compact"
                    value={timeToDate(time)}
                    minuteInterval={5}
                    accessibilityLabel={`Notification time ${index + 1}`}
                    onChange={(event, picked) => setMotivationTime(index, event, picked)}
                  />
                  {motivationTimes.length > 1 && (
                    <IconButton
                      testID={`motivation-time-${index}-remove`}
                      icon="close"
                      variant="plain"
                      tone="text2"
                      accessibilityLabel={`Remove time ${index + 1}`}
                      onPress={() => removeMotivationTime(index)}
                    />
                  )}
                </View>
              ))}
              {motivationTimes.length < MAX_DAILY_MOTIVATION_TIMES && (
                <PressableScale
                  testID="motivation-time-add"
                  accessibilityRole="button"
                  accessibilityLabel="Add a time"
                  onPress={addMotivationTime}
                  style={styles.addTime}
                >
                  <Icon name="add" size={18} color="teal" />
                  <Txt variant="eyebrow" color="teal" style={styles.addTimeLabel}>
                    Add a time ({motivationTimes.length}/{MAX_DAILY_MOTIVATION_TIMES} per day)
                  </Txt>
                </PressableScale>
              )}
            </View>
          ) : null}
        </Group>
      </Enter>

      <Enter index={5}>
        <Group title="Travel & privacy">
          <SwitchRow
            testID="toggle-passport"
            icon="airplane"
            tone="sky"
            label="Passport"
            value={user.passportEnabled}
            onValueChange={togglePassport}
          />
        </Group>
      </Enter>

      <Enter index={6}>
        <Group title="Apple Health">
          <SwitchRow
            testID="toggle-healthkit-write"
            icon="heart"
            tone="fern"
            label="Write workouts to Apple Health"
            value={user.healthWriteEnabled}
            onValueChange={toggleHealthWrite}
          />
        </Group>
      </Enter>

      <Enter index={7}>
        <Group
          title="iCloud backup"
          subtitle="Your workouts and progress are saved to iCloud when connected to the internet"
          caption={backupCaption}
        >
          <SwitchRow
            testID="toggle-icloud-backup"
            icon="cloud"
            tone="summit"
            label="Back up to iCloud"
            value={user.icloudBackupEnabled}
            onValueChange={toggleBackup}
          />
          {user.icloudBackupEnabled ? (
            <NavRow
              testID="backup-now"
              icon="refresh"
              tone="summit"
              label="Back up now"
              value={backupStatusLine}
              hint="Saves a backup to iCloud"
              onPress={() => void backUpNow()}
            />
          ) : null}
          {user.backupDecisionPending ? (
            <NavRow
              testID="keep-this-phone"
              icon="shield"
              tone="summit"
              label="Keep this phone's data"
              hint="Lets this phone's data replace the iCloud backup at the next backup"
              onPress={() => setKeepOpen(true)}
            />
          ) : null}
        </Group>
      </Enter>

      <Enter index={8}>
        <Group title="Learn">
          <NavRow
            testID="settings-anchor-safety"
            icon="anchor"
            tone="sky"
            label="Anchor safety"
            hint="Opens the guide to anchoring bands safely"
            onPress={() => navigation.navigate('AnchorSafety')}
          />
          <NavRow
            testID="settings-glossary"
            icon="guide"
            tone="teal"
            label="Glossary"
            hint="Opens plain-language definitions of the terms the app uses"
            onPress={() => navigation.navigate('Glossary')}
          />
        </Group>
      </Enter>

      <Enter index={9}>
        <Group title="Feedback">
          <NavRow
            testID="settings-feedback"
            icon="mail"
            tone="teal"
            label="Send feedback"
            value={feedbackNote ?? undefined}
            hint="Opens an email to the developers"
            onPress={() => void sendFeedback()}
          />
        </Group>
      </Enter>

      <Enter index={10}>
        <Card padding="md" style={styles.disclaimer} testID="settings-section-Medical disclaimer">
          <IconBadge icon="shield" tone="gold" size={40} />
          <View style={styles.disclaimerBody}>
            <Txt variant="eyebrow" color="text3" accessibilityRole="header">
              Medical disclaimer
            </Txt>
            <Txt variant="small" color="text2" testID="disclaimer-text">
              {DISCLAIMER_TEXT}
            </Txt>
          </View>
        </Card>
      </Enter>

      <Enter index={11}>
        <Group title="Advanced">
          <Pressable
            testID="settings-advanced-toggle"
            accessibilityRole="button"
            accessibilityLabel="Diagnostics and reset"
            accessibilityState={{ expanded: advancedOpen }}
            onPress={() => {
              haptics.selection();
              setAdvancedOpen((open) => !open);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <IconTile icon="settings" tone="summit" />
            <Txt variant="h3" style={styles.rowLabel}>
              Diagnostics &amp; reset
            </Txt>
            <Icon name={advancedOpen ? 'chevronUp' : 'chevronDown'} size={18} color="text3" />
          </Pressable>
          {advancedOpen && backupStatus?.available && backupStatus.lastBackedUpAt != null ? (
            <NavRow
              testID="restore-icloud"
              icon="refresh"
              tone="summit"
              label="Restore from iCloud backup"
              value={restoring ? 'Restoring…' : formatBackupTime(backupStatus.lastBackedUpAt)}
              hint="Replaces the data on this phone with your iCloud backup"
              onPress={() => {
                if (!restoring) setRestoreOpen(true);
              }}
            />
          ) : null}
          {advancedOpen && restoreMessage ? (
            <View style={styles.advancedBlock}>
              <Txt variant="small" color="text2" testID="restore-message">
                {restoreMessage}
              </Txt>
            </View>
          ) : null}
          {advancedOpen ? (
            <View style={styles.advancedBlock}>
              <Txt variant="h3">Diagnostics</Txt>
              <Txt variant="caption" color="text3">
                On-device usage diagnostics — nothing here ever leaves this device.
              </Txt>
              <Button
                testID="load-diagnostics"
                label="Load diagnostics"
                variant="secondary"
                size="sm"
                onPress={loadDiagnostics}
              />
              {diagnosticsLines.length > 0 ? (
                <View style={styles.well} testID="diagnostics-lines">
                  {diagnosticsLines.map((line) => (
                    <Txt key={line} variant="caption" color="text2" style={styles.mono}>
                      {line}
                    </Txt>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {advancedOpen ? (
            <View style={styles.advancedBlock}>
              <Txt variant="h3">Reset progression ladders</Txt>
              <Txt variant="caption" color="text3">
                Restarts the session count at whatever level each ladder is currently on — it does
                not move any ladder up or down a rung.
              </Txt>
              <Button
                testID="reset-progression-sessions"
                label="Reset ladders to 0 sessions"
                variant="secondary"
                size="sm"
                onPress={() => setResetOpen(true)}
              />
            </View>
          ) : null}
        </Group>
      </Enter>

      <View style={styles.footer}>
        <Txt variant="eyebrow" color="text3">
          Wanderlift
        </Txt>
        <Txt variant="caption" color="text3">
          Train anywhere.
        </Txt>
        <Txt variant="caption" color="text3" testID="app-version">
          Version {appVersionLabel()}
        </Txt>
      </View>

      {/* The reset confirm (DESIGN.md §5.11): the safe choice is the loud one, and there is no red. */}
      <Sheet
        testID="reset-sheet"
        visible={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset progression ladders?"
      >
        <Txt variant="small" color="text2" style={styles.sheetBody}>
          Every ladder goes back to 0 sessions at its current level. Your current level on each
          ladder is kept — this doesn&apos;t move anyone up or down a rung.
        </Txt>
        <View style={styles.sheetButtons} testID="reset-confirm-row">
          <Button
            testID="reset-confirm-cancel"
            label="Keep my progress"
            onPress={() => setResetOpen(false)}
          />
          <Button
            testID="reset-confirm-yes"
            label="Reset ladders"
            variant="secondary"
            size="md"
            fullWidth
            onPress={resetProgressionSessions}
          />
        </View>
      </Sheet>

      <Sheet
        testID="restore-sheet"
        visible={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore from iCloud?"
      >
        <Txt variant="small" color="text2" style={styles.sheetBody}>
          This replaces the data on this phone with your backup from{' '}
          {backupStatus?.lastBackedUpAt != null
            ? formatBackupTime(backupStatus.lastBackedUpAt)
            : ''}
          .
        </Txt>
        <View style={styles.sheetButtons}>
          <Button
            testID="restore-confirm-cancel"
            label="Keep this phone's data"
            onPress={() => setRestoreOpen(false)}
          />
          <Button
            testID="restore-confirm-yes"
            label="Restore"
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => {
              setRestoreOpen(false);
              void restore();
            }}
          />
        </View>
      </Sheet>

      <KeepPhoneSheet
        visible={keepOpen}
        onClose={() => setKeepOpen(false)}
        title="Keep this phone's data?"
        confirmLabel="Keep this phone's data"
        onConfirm={() => {
          keepThisPhonesData(db);
          setKeepOpen(false);
          refresh();
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((tk) =>
  StyleSheet.create({
    content: { paddingTop: space.sm, gap: space.xxl },
    appearance: { flexDirection: 'row', gap: space.sm, padding: space.md },
    appearanceOption: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingHorizontal: ROW_PAD,
      paddingVertical: space.sm,
    },
    rowPressed: { backgroundColor: tk.colors.surface2 },
    rowLabel: { flex: 1, flexShrink: 1, marginHorizontal: space.md },
    times: {
      gap: space.sm,
      paddingHorizontal: ROW_PAD,
      paddingVertical: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tk.colors.line,
    },
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addTime: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: tk.colors.lineStrong,
    },
    addTimeLabel: { marginLeft: space.xs },
    disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
    disclaimerBody: { flex: 1, gap: space.xs },
    advancedBlock: {
      gap: space.sm,
      alignItems: 'flex-start',
      padding: ROW_PAD,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tk.colors.line,
    },
    well: {
      alignSelf: 'stretch',
      gap: space.xs,
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: tk.colors.surface2,
    },
    // Intentional off-scale face: diagnostics output is monospace on purpose (DESIGN.md §5.10).
    mono: { fontFamily: 'Menlo' },
    footer: { alignItems: 'center', gap: 2, paddingTop: space.md },
    sheetBody: { marginBottom: space.xl },
    sheetButtons: { gap: space.md },
  }),
);
