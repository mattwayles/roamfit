/**
 * Track 37h — first-launch setup, and the same steps again from Settings ("Run setup again").
 *
 * Welcome + medical disclaimer → goal → experience and starting levels → equipment → limitations →
 * training days → anchor safety. Every choice saves the moment it is made, through the same store
 * calls Settings uses, so leaving part-way keeps what was chosen and a relaunch resumes the setup
 * (`users.onboarding_state`). Every step after the disclaimer can be skipped: "Skip setup" keeps the
 * recommended defaults, which are built for a beginner.
 *
 * `mode: 'first'` is the blocking first-launch gate Home renders (tab bar hidden); acknowledging the
 * disclaimer is its first step and cannot be skipped (§13.3). `mode: 'review'` starts at the goal
 * step with everything prefilled; its starting-levels step moves no ladder unless the user answers
 * it, because re-placing restarts each trail's progress.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { Anchor } from '@roamfit/data';
import { placeOnLadders } from '@roamfit/engine';
import { progressionStateRepo, usersRepo } from '@roamfit/store';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { ANCHOR_GROUPS, BANDS_ROW, bandsToggled, hasBands } from '../lib/equipment';
import { GOAL_GROUP } from '../lib/trainingOptions';
import { DISCLAIMER_TEXT } from '../lib/disclaimer';
import { makeStyles, space } from '../theme';
import { Button, Card, Screen, TopoPattern, Txt } from '../ui';
import { AnchorSafetyGuide } from './AnchorSafetyGuide';
import { BandSetup } from './BandSetup';
import { DAYS_PER_WEEK_CAPTION, DaysPerWeekStepper } from './DaysPerWeekStepper';
import { LimitationPicker } from './LimitationPicker';
import { DEFAULT_PLACEMENT, PlacementPicker } from './PlacementPicker';
import type { PlacementValue } from './PlacementPicker';
import { CheckRow, Group } from './SettingsList';
import { TrainingOptionPicker } from './TrainingOptionPicker';

type StepId =
  'welcome' | 'goal' | 'placement' | 'equipment' | 'bands' | 'limitations' | 'days' | 'safety';

const STEP_TITLES: Record<StepId, string> = {
  welcome: 'Welcome to Wanderlift',
  goal: 'What are you training for?',
  placement: 'Where are you starting from?',
  equipment: 'What do you have to train with?',
  bands: 'Your bands',
  limitations: 'Anything to work around?',
  days: 'How often do you want to train?',
  safety: 'Anchoring bands safely',
};

const STEP_INTROS: Partial<Record<StepId, string>> = {
  goal: 'This sets your reps, rest and sets. Not sure? General fitness suits almost everyone.',
  placement:
    'Answer what you can and each trail starts at a level that fits. Skip it and everything starts at the first level, which is right for most beginners.',
  equipment:
    'Tick what you can use. Bodyweight moves are always included; band moves need Resistance bands, and anchored ones also need an anchor point.',
  bands:
    'Untick any bands you do not have, and name or recolour them to match yours. No bands is fine too.',
  limitations:
    'Wanderlift will leave out anything that loads what you tick. You can change this any time in Settings.',
  days: 'A rough number is fine. Train on whichever days suit you.',
};

export function OnboardingFlow({
  mode,
  onDone,
}: {
  mode: 'first' | 'review';
  onDone: () => void;
}): React.JSX.Element {
  const { db, library, families } = useStore();
  const styles = useStyles();
  const steps: StepId[] = useMemo(
    () =>
      mode === 'first'
        ? ['welcome', 'goal', 'placement', 'equipment', 'bands', 'limitations', 'days', 'safety']
        : ['goal', 'placement', 'equipment', 'bands', 'limitations', 'days', 'safety'],
    [mode],
  );
  const [user, setUser] = useState(() => usersRepo.ensureUser(db, nowUtcInstant()));
  // A relaunch mid-setup resumes after the disclaimer, which is already acknowledged.
  const [index, setIndex] = useState(() => (mode === 'first' && user.onboardingInProgress ? 1 : 0));
  const [placement, setPlacement] = useState<PlacementValue>(DEFAULT_PLACEMENT);
  const [placementTouched, setPlacementTouched] = useState(false);

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
    if (mode === 'first') usersRepo.finishOnboarding(db, nowUtcInstant());
    onDone();
  }, [db, mode, onDone]);

  const leaveStep = useCallback(() => {
    // Placement moves ladders, so it is applied once, on leaving its step, and only if answered.
    if (step === 'placement' && placementTouched) {
      progressionStateRepo.applyPlacement(
        db,
        families,
        library.exercises,
        placeOnLadders(families.families, placement),
        nowUtcInstant(),
      );
      setPlacementTouched(false);
    }
  }, [db, families, library, placement, placementTouched, step]);

  const next = () => {
    leaveStep();
    if (isLast) finish();
    else setIndex((i) => i + 1);
  };
  const back = () => {
    leaveStep();
    setIndex((i) => Math.max(0, i - 1));
  };
  const skip = () => {
    leaveStep();
    finish();
  };

  const toggleAnchor = (anchor: Anchor) => {
    const current = user.anchorsAvailable;
    save({
      anchorsAvailable: current.includes(anchor)
        ? current.filter((a) => a !== anchor)
        : [...current, anchor],
    });
  };

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
              label={isLast ? (mode === 'first' ? 'Start training' : 'Done') : 'Continue'}
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
            label={mode === 'first' ? 'Skip setup' : 'Close'}
            variant="quiet"
            size="sm"
            accessibilityHint="Keeps the recommended settings for everything not yet chosen"
            onPress={skip}
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

      {step === 'placement' ? (
        <>
          {mode === 'review' && !placementTouched ? (
            <Txt variant="small" color="text3" testID="placement-review-note">
              Your trails stay where they are unless you answer below.
            </Txt>
          ) : null}
          <PlacementPicker
            value={placement}
            onChange={(v) => {
              setPlacement(v);
              setPlacementTouched(true);
            }}
          />
        </>
      ) : null}

      {step === 'equipment' ? (
        <>
          <Group title="Bands">
            <CheckRow
              testID="onboarding-bands"
              label={BANDS_ROW.label}
              description={BANDS_ROW.hint}
              checked={hasBands(user.bandSettings)}
              onPress={() => save({ bandSettings: bandsToggled(user.bandSettings) })}
            />
          </Group>
          {ANCHOR_GROUPS.map((group) => (
            <Group key={group.title} title={group.title}>
              {group.anchors.map((a) => {
                const locked = a.needsBands === true && !hasBands(user.bandSettings);
                return (
                  <CheckRow
                    key={a.value}
                    testID={`onboarding-anchor-${a.value}`}
                    label={a.label}
                    description={locked ? 'Tick Resistance bands first' : a.hint}
                    checked={!locked && user.anchorsAvailable.includes(a.value)}
                    disabled={locked}
                    onPress={() => toggleAnchor(a.value)}
                  />
                );
              })}
            </Group>
          ))}
        </>
      ) : null}

      {step === 'bands' ? (
        <BandSetup
          settings={user.bandSettings}
          tensions={user.bandTensions}
          onChangeSettings={(bandSettings) => save({ bandSettings })}
          onChangeTension={(band, patch) => {
            usersRepo.updateBandTension(db, band, patch, nowUtcInstant());
            refresh();
          }}
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

      {step === 'days' ? (
        <Group title="Training days per week" caption={DAYS_PER_WEEK_CAPTION}>
          <DaysPerWeekStepper
            days={user.weeklyTarget}
            onChange={(weeklyTarget) => save({ weeklyTarget })}
          />
        </Group>
      ) : null}

      {step === 'safety' ? <AnchorSafetyGuide /> : null}
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
    wordmark: { textAlign: 'left' },
    content: { paddingTop: space.md, gap: space.xl },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    footerMain: { flex: 1 },
  }),
);
