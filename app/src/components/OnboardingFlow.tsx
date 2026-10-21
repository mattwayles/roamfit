/**
 * Track 37h — first-launch setup. It runs once; there is no way back into it (Track 41), because
 * the goal and limitations it asks about are both in Settings.
 *
 * Welcome + medical disclaimer → goal → limitations. Every choice saves the moment it is made,
 * through the same store calls Settings uses, so leaving part-way keeps what was chosen and a
 * relaunch resumes the setup (`users.onboarding_state`). Every step after the disclaimer can be
 * skipped: "Skip setup" keeps the recommended defaults, which are built for a beginner.
 *
 * Deliberately not asked here (Track 40): starting levels (every trail starts at its first rung,
 * and Journey moves any ladder freely), equipment (Generate asks per workout, and offers
 * Your bands the first time bands are ticked), and the anchor safety guide (Settings → Learn).
 *
 * Track 43: on a fresh install the welcome step also offers an iCloud backup when one exists
 * ("Welcome back"). The check is asynchronous and never gates the step; ignoring the offer leaves
 * the decision pending for Settings, and no backup can overwrite iCloud meanwhile.
 *
 * It is the blocking first-launch gate Home renders (tab bar hidden); acknowledging the disclaimer
 * is its first step and cannot be skipped (§13.3).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';
import { usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { GOAL_GROUP } from '../lib/trainingOptions';
import { DISCLAIMER_TEXT } from '../lib/disclaimer';
import { LOGO_ASPECT, logoFor } from '../lib/brand';
import { checkForExistingBackup, formatBackupTime, keepThisPhonesData } from '../lib/icloudBackup';
import type { BackupStat } from '../../modules/icloud-backup';
import { useICloudRestore } from '../state/useICloudRestore';
import { makeStyles, space, useTheme } from '../theme';
import { Button, Card, Screen, TopoPattern, Txt } from '../ui';
import { KeepPhoneSheet } from './KeepPhoneSheet';
import { LimitationPicker } from './LimitationPicker';
import { TrainingOptionPicker } from './TrainingOptionPicker';

type StepId = 'welcome' | 'goal' | 'limitations';

const STEPS: readonly StepId[] = ['welcome', 'goal', 'limitations'];

const STEP_TITLES: Record<StepId, string> = {
  welcome: 'Welcome to Wanderlift',
  goal: 'What are you training for?',
  limitations: 'Anything to work around?',
};

const STEP_INTROS: Partial<Record<StepId, string>> = {
  goal: 'This sets your reps, rest and sets. Not sure? General fitness suits almost everyone.',
  limitations:
    'Wanderlift will leave out anything that loads what you tick. You can change this any time in Settings.',
};

export function OnboardingFlow({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { db } = useStore();
  const theme = useTheme();
  const styles = useStyles();
  const steps = STEPS;
  const [user, setUser] = useState(() => usersRepo.ensureUser(db, nowUtcInstant()));
  // A relaunch mid-setup resumes after the disclaimer, which is already acknowledged.
  const [index, setIndex] = useState(() => (user.onboardingInProgress ? 1 : 0));
  const [offer, setOffer] = useState<BackupStat | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const { restoring, message, restore } = useICloudRestore();

  useEffect(() => {
    let cancelled = false;
    void checkForExistingBackup(db).then((found) => {
      if (!cancelled && found) setOffer(found);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  const refresh = useCallback(() => setUser(usersRepo.getUser(db)!), [db]);
  const save = useCallback(
    (patch: usersRepo.UserPatch) => {
      usersRepo.updateUser(db, patch, nowUtcInstant());
      refresh();
    },
    [db, refresh],
  );

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Step ${index + 1} of ${steps.length}. ${STEP_TITLES[step]}`,
    );
  }, [index, step, steps.length]);

  const finish = useCallback(() => {
    usersRepo.finishOnboarding(db, nowUtcInstant());
    onDone();
  }, [db, onDone]);

  const next = () => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };
  const back = () => setIndex((i) => Math.max(0, i - 1));

  if (step === 'welcome') {
    return (
      <View style={styles.gate} testID="disclaimer-gate">
        <TopoPattern seed="wanderlift-gate" strength={0.6} />
        <Screen
          scroll
          edges={['top', 'left', 'right', 'bottom']}
          contentStyle={styles.gateContent}
          style={styles.gateScreen}
        >
          <Image
            source={logoFor(theme.scheme)}
            style={styles.logo}
            resizeMode="contain"
            accessible={false}
            testID="welcome-logo"
          />
          <Txt variant="hero" color="teal" style={styles.wordmark} accessibilityRole="header">
            WANDERLIFT
          </Txt>
          <Txt variant="eyebrow" color="gold">
            Train anywhere.
          </Txt>
          <Txt variant="body" color="text2">
            A few quick questions set up workouts that fit you, whether this is your first workout
            or your thousandth. Every answer can be changed later in Settings.
          </Txt>
          {offer ? (
            <Card testID="restore-offer">
              <Txt variant="bodyStrong">
                Welcome back — there&apos;s a Wanderlift backup in your iCloud from{' '}
                {formatBackupTime(offer.modifiedAt)}.
              </Txt>
              {message ? (
                <Txt variant="small" color="text2" testID="restore-message">
                  {message}
                </Txt>
              ) : null}
              <Button
                testID="restore-offer-restore"
                label={restoring ? 'Restoring…' : 'Restore my data'}
                disabled={restoring}
                onPress={() => void restore()}
              />
              <Button
                testID="restore-offer-fresh"
                label="Start fresh"
                variant="secondary"
                size="md"
                disabled={restoring}
                onPress={() => setConfirmFresh(true)}
              />
            </Card>
          ) : null}
          <Card>
            <Txt variant="body" color="text2" testID="disclaimer-gate-text">
              {DISCLAIMER_TEXT}
            </Txt>
          </Card>
          <Button
            testID="disclaimer-acknowledge"
            label="I understand"
            size="lg"
            haptic="medium"
            onPress={() => {
              usersRepo.beginOnboarding(db, nowUtcInstant());
              refresh();
              setIndex(1);
            }}
          />
        </Screen>
        <KeepPhoneSheet
          visible={confirmFresh}
          onClose={() => setConfirmFresh(false)}
          title="Start fresh?"
          confirmLabel="Start fresh"
          onConfirm={() => {
            keepThisPhonesData(db);
            setConfirmFresh(false);
            setOffer(null);
          }}
        />
      </View>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'left', 'right']}
      testID="onboarding-screen"
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {index > 0 && steps[index - 1] !== 'welcome' ? (
            <Button
              testID="onboarding-back"
              label="Back"
              variant="secondary"
              size="md"
              onPress={back}
            />
          ) : null}
          <View style={styles.footerMain}>
            <Button
              testID="onboarding-next"
              label={isLast ? 'Start training' : 'Continue'}
              size="md"
              fullWidth
              onPress={next}
            />
          </View>
        </View>
      }
    >
      <View style={styles.header}>
        <Txt
          variant="eyebrow"
          color="text3"
          testID="onboarding-progress"
          accessibilityLabel={`Step ${index + 1} of ${steps.length}`}
        >
          {index + 1} of {steps.length}
        </Txt>
        {!isLast ? (
          <Button
            testID="onboarding-skip"
            label="Skip setup"
            variant="quiet"
            size="sm"
            accessibilityHint="Keeps the recommended settings for everything not yet chosen"
            onPress={finish}
          />
        ) : null}
      </View>
      <Txt variant="h1" accessibilityRole="header" testID={`onboarding-step-${step}`}>
        {STEP_TITLES[step]}
      </Txt>
      {STEP_INTROS[step] ? (
        <Txt variant="body" color="text2">
          {STEP_INTROS[step]}
        </Txt>
      ) : null}

      {step === 'goal' ? (
        <TrainingOptionPicker
          group={GOAL_GROUP}
          value={user.trainingPreferences.goal}
          onChange={(goal) => save({ trainingPreferences: { goal } })}
        />
      ) : null}

      {step === 'limitations' ? (
        <LimitationPicker
          selected={user.limitationChoices.map((c) => c.id)}
          onChange={(ids) => {
            usersRepo.setLimitationChoices(db, ids, nowEngineClock().today, nowUtcInstant());
            refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((tk) =>
  StyleSheet.create({
    gate: { flex: 1, backgroundColor: tk.colors.bg },
    gateScreen: { backgroundColor: 'transparent' },
    gateContent: {
      flexGrow: 1,
      justifyContent: 'center',
      gap: space.xxl,
      paddingVertical: space.xxl,
    },
    // Decorative: the wordmark below is the header. Negative margin pulls the glow padding in.
    logo: { width: 180, height: 180 / LOGO_ASPECT, marginBottom: -space.lg },
    wordmark: { textAlign: 'left' },
    content: { paddingTop: space.md, gap: space.xl },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    footerMain: { flex: 1 },
  }),
);
