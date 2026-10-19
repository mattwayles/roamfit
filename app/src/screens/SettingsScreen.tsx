/**
 * §13.3/§13.5 Settings — a grouped, iOS-style list on `bg` (DESIGN.md §5.10), most-changed first:
 * Appearance, Training, Motivation, Travel & privacy, Apple Health, the Medical disclaimer card, and the rare
 * stuff (diagnostics, reset) tucked behind an Advanced disclosure. It is the permanent home for:
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
 * diagnostics panel is a straight `instrumentationRepo.computeInstrumentationSnapshot` read. This
 * file is presentation only: nothing it reads or writes changed when it got its new look.
 *
 * Every boolean is the design system's `Switch`. Each `toggle-*` id sits on its *row* (tap anywhere
 * on the row), and the row's `accessibilityState.checked` is the value; the switch inside carries
 * `${id}-switch`. Tests press the row, not a native switch's `valueChange`.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  MAX_DAILY_MOTIVATION_TIMES,
  quietHoursLabel,
  shiftTime,
} from '../lib/motivationNotifications';
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

const APPEARANCE_CAPTION =
  'Daybreak is built for training outdoors in full sun. System follows your iPhone, which can switch at sunset.';

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

  const refresh = useCallback(() => {
    setUser(usersRepo.getUser(db) ?? usersRepo.ensureUser(db, nowUtcInstant()));
  }, [db]);

  useFocusEffect(refresh);

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

  const adjustMotivationTime = useCallback(
    (index: number, deltaMinutes: number) => {
      saveMotivationTimes(
        motivationTimes.map((t, i) => (i === index ? shiftTime(t, deltaMinutes) : t)),
      );
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

  const quietHoursEnabled = user.notificationPrefs.quietHoursEnabled ?? true;
  const quietStart = user.notificationPrefs.quietHoursStart ?? DEFAULT_QUIET_HOURS_START;
  const quietEnd = user.notificationPrefs.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;
  const adjustQuietHour = (which: 'start' | 'end', delta: number) => {
    const current = which === 'start' ? quietStart : quietEnd;
    const next = (current + delta + 24) % 24;
    usersRepo.updateUser(
      db,
      {
        notificationPrefs: which === 'start' ? { quietHoursStart: next } : { quietHoursEnd: next },
      },
      nowUtcInstant(),
    );
    refresh();
  };
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

  return (
    <Screen scroll testID="settings-screen" contentStyle={styles.content}>
      <Enter index={0}>
        <Txt variant="h1" accessibilityRole="header">
          Settings
        </Txt>
      </Enter>

      <Enter index={1}>
        <Group title="Appearance" caption={APPEARANCE_CAPTION}>
          <AppearanceControl />
        </Group>
      </Enter>

      <Enter index={2}>
        <Group
          title="Your body"
          caption="Wanderlift leaves out anything that loads an area you protect. Change it any time."
        >
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
        <Group
          title="Training"
          caption="Timer sounds: the 3-2-1 count, the halfway chime and the end-of-rest tone. They mix with whatever else is playing rather than pausing it. Vibration cues are unaffected either way, so a silent workout still tells you when a hold or a rest is up. There is also a mute button on the workout itself, for one session at a time. “Ask how each exercise felt” opens a quick Too easy / Just right / Too hard question over the rest timer after an exercise’s last set; off, the same question sits on that rest page instead."
        >
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
        <Group
          title="Motivation"
          caption={
            'A short nudge picked from a large, always-varied pool — never the same message twice in a row where avoidable. Skipped automatically on a day you’ve already trained or marked “I’m in Transit,” and every time below still respects quiet hours.'
          }
        >
          <SwitchRow
            testID="toggle-motivation"
            icon="sparkles"
            tone="teal"
            label="Daily motivation"
            value={motivationEnabled}
            onValueChange={toggleMotivation}
          />
          <SwitchRow
            testID="toggle-quiet-hours"
            icon="moon"
            tone="teal"
            label={`Quiet hours (${quietHoursLabel(quietStart, quietEnd)})`}
            value={quietHoursEnabled}
            onValueChange={toggleQuietHours}
          />
          {quietHoursEnabled ? (
            <View style={styles.times} testID="quiet-hours-window">
              {(
                [
                  ['start', 'Quiet from', quietStart],
                  ['end', 'Until', quietEnd],
                ] as const
              ).map(([which, label, hour]) => (
                <View key={which} style={styles.timeRow}>
                  <Txt variant="bodyStrong">{label}</Txt>
                  <View style={styles.timePill}>
                    <IconButton
                      testID={`quiet-${which}-minus`}
                      icon="remove"
                      accessibilityLabel={`${label} one hour earlier`}
                      onPress={() => adjustQuietHour(which, -1)}
                    />
                    <Txt
                      variant="h2"
                      style={styles.timeValue}
                      testID={`quiet-${which}-value`}
                      accessibilityLabel={`${label} ${quietHoursLabel(hour, hour).split('–')[0]}`}
                    >
                      {quietHoursLabel(hour, hour).split('–')[0]}
                    </Txt>
                    <IconButton
                      testID={`quiet-${which}-plus`}
                      icon="add"
                      accessibilityLabel={`${label} one hour later`}
                      onPress={() => adjustQuietHour(which, 1)}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {motivationEnabled ? (
            <View style={styles.times} testID="motivation-times">
              {motivationTimes.map((time, index) => (
                <View key={index} style={styles.timeRow} testID={`motivation-time-row-${index}`}>
                  <View style={styles.timePill}>
                    <IconButton
                      testID={`motivation-time-${index}-minus`}
                      icon="remove"
                      accessibilityLabel={`Move time ${index + 1} 15 minutes earlier`}
                      onPress={() => adjustMotivationTime(index, -15)}
                    />
                    <Txt
                      variant="h2"
                      style={styles.timeValue}
                      testID={`motivation-time-${index}-value`}
                    >
                      {time}
                    </Txt>
                    <IconButton
                      testID={`motivation-time-${index}-plus`}
                      icon="add"
                      accessibilityLabel={`Move time ${index + 1} 15 minutes later`}
                      onPress={() => adjustMotivationTime(index, 15)}
                    />
                  </View>
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
        <View style={styles.privacyGroup}>
          <Group title="Travel & privacy">
            <SwitchRow
              testID="toggle-passport"
              icon="airplane"
              tone="sky"
              label="Passport (place on completion)"
              value={user.passportEnabled}
              onValueChange={togglePassport}
            />
          </Group>
          <View style={styles.privacyCopy}>
            <Txt variant="caption" color="text3">
              Location: opt-in, coarse (nearest town or area) only, resolved once when you complete
              a session. No coordinates and no continuous or background tracking — only place names
              (like “Bend, OR, USA”) are ever stored.
            </Txt>
            <Txt variant="caption" color="text3">
              Health data (workout duration and estimated energy) is written to Apple Health, never
              read back, and never leaves this device.
            </Txt>
            <Txt variant="caption" color="text3">
              If you add optional freeform notes, that text is your content and is sent off-device
              only to generate a short coaching summary — never stored or used for anything else.
            </Txt>
          </View>
        </View>
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

      <Enter index={8}>
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

      <Enter index={9}>
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
    timePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      padding: space.xs,
      borderRadius: radius.pill,
      backgroundColor: tk.colors.surface2,
    },
    timeValue: { minWidth: 72, textAlign: 'center' },
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
    privacyGroup: { gap: space.sm },
    privacyCopy: { gap: space.sm, marginHorizontal: space.xs },
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
