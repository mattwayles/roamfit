/**
 * §10.9/§6.4/§6.7 completion — driven through the real SummaryScreen against the real on-device-
 * shaped store (not mocked). Forces a real level-up by seeding every family one qualifying
 * session away from a level change (via the real `microAdvance` walk, not a fabricated event),
 * then meeting the prescription for every entry, so this test proves a real level-up actually lands
 * on the completion screen, not just that it type-checks.
 *
 * There used to be a calibration mode where a single `too_easy` rating jumped a full level
 * immediately; that's gone (a new user climbs the ladder like everyone else, or uses the
 * "too easy"/"too hard" board buttons), so this test drives the ordinary exhaustion-based advance
 * instead.
 */
import React from 'react';
import { Keyboard, Share, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  baseStartLevel,
  createRng,
  defaultMicroForExercise,
  microAdvance,
  seedFromString,
} from '@roamfit/engine';
import type { ProgressionMicroState } from '@roamfit/engine';
import type { Exercise } from '@roamfit/data';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, progressionStateRepo, sessionsRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { buildSessionCompletionStats } from '../lib/sessionStats';
import { pickHypeHeadline } from '../lib/celebration';

// A jest.fn wrapper around the real picker so the haptics test can pin the headline shape.
jest.mock('../lib/celebration', () => {
  const actual = jest.requireActual('../lib/celebration');
  return { ...actual, pickHypeHeadline: jest.fn(actual.pickHypeHeadline) };
});

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

/** Walks the real `microAdvance` ladder from a level's default micro-state to the one qualifying
 *  session *before* it would trigger a level change — so seeding this and then meeting the
 *  prescription once produces a real, earned `level_up` event, not a fabricated one. */
function oneStepFromLevelUp(exercise: Exercise): ProgressionMicroState {
  let current = defaultMicroForExercise(exercise);
  for (let i = 0; i < 100; i += 1) {
    const step = microAdvance(current, exercise);
    if (step.levelChange === 'up') return current;
    current = step.micro;
  }
  throw new Error('microAdvance never reached a level change — check the ladder constants');
}

/** Seeds every family one qualifying session away from a level change, then builds a real started
 *  session and logs every set exactly at its prescribed target, so `completeSession` is
 *  guaranteed to produce at least one real level_up event — no fabricated progression event, just
 *  state positioned so a session that meets its prescription earns one for real. */
async function createAndRunSessionForLevelUp(
  db: ReturnType<typeof useStore>['db'],
): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  for (const family of familyLibrary.families) {
    const level = baseStartLevel(family);
    const exercise = exerciseLibrary.exercises.find((e) => e.id === level.anchor_exercise_id)!;
    progressionStateRepo.upsertProgressionState(
      db,
      {
        familyId: family.id,
        levelId: level.level_id,
        micro: oneStepFromLevelUp(exercise),
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
      utcInstant,
    );
  }
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('summary-levelup-seed')),
    utcInstant,
  });
  const sessionId = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, sessionId, utcInstant);
  const session = sessionsRepo.getSession(db, sessionId)!;
  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        utcInstant,
      );
    }
  }
  return sessionId;
}

/** A real started session whose first entry has set 1 skipped and set 2 trained — the shape the
 *  ▸▸ skip produces, so the summary has both kinds of line to render. */
async function createSessionWithASkippedFirstSet(
  db: ReturnType<typeof useStore>['db'],
): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('summary-skipped-seed')),
    utcInstant,
  });
  const sessionId = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, sessionId, utcInstant);
  const session = sessionsRepo.getSession(db, sessionId)!;
  const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const entry = active[0]!;
  sessionsRepo.logSet(
    db,
    {
      entryId: entry.id,
      setIndex: 0,
      status: 'skipped',
      repsPrescribed: entry.repTarget ?? undefined,
      secondsPrescribed: entry.durationSec ?? undefined,
      restPrescribedSec: entry.restSec,
    },
    utcInstant,
  );
  sessionsRepo.logSet(
    db,
    {
      entryId: entry.id,
      setIndex: 1,
      status: 'completed',
      repsPrescribed: entry.repTarget ?? undefined,
      secondsPrescribed: entry.durationSec ?? undefined,
      repsActual: entry.repTarget ?? undefined,
      secondsActual: entry.durationSec ?? undefined,
      restPrescribedSec: entry.restSec,
    },
    utcInstant,
  );
  // Log every remaining set (this entry's own set 2+, plus every other entry in full) so the
  // session is fully logged — SummaryScreen only shows FINISH/retrospective once the front edge
  // is gone, and these tests are about set-line rendering, not partial-completion behavior.
  for (const e of active) {
    const startIndex = e.id === entry.id ? 2 : 0;
    for (let i = startIndex; i < e.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: e.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: e.repTarget ?? undefined,
          secondsPrescribed: e.durationSec ?? undefined,
          repsActual: e.repTarget ?? undefined,
          secondsActual: e.durationSec ?? undefined,
          restPrescribedSec: e.restSec,
        },
        utcInstant,
      );
    }
  }
  return sessionId;
}

describe('§10.9/§6.4 Summary completion, driven through SummaryScreen', () => {
  it('FINISH completes the session; a real level-up lands on the completion screen itself (no separate screen), stamps in, shares, and Heck yes goes Home', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createAndRunSessionForLevelUp(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('finish-button'));

    // The session really is completed in the store — proves FINISH -> completeSession ran for
    // real, not just that the screen re-rendered.
    await waitFor(() => {
      expect(sessionsRepo.getSession(db, sessionId)!.status).toBe('completed');
    }, WAIT_OPTS);

    // Every family was seeded one qualifying session from a level change and every entry met
    // its prescription — at least one family's level_up fired. It lands on the one completion
    // screen, alongside the stats: there is no separate screen to step through first.
    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('completion-highlights')).toBeTruthy();
    expect(screen.getByTestId('completion-stats')).toBeTruthy();
    expect(screen.getByTestId('return-home')).toBeTruthy();
    expect(screen.queryByTestId('level-up-celebration')).toBeNull();
    expect(screen.queryByTestId('celebration-continue')).toBeNull();
    expect(screen.getAllByText('LEVEL UP').length).toBeGreaterThanOrEqual(1);

    // The card is laid out from the start but untappable until its beat in the sequence (after
    // the stats count up) — wait for it to stamp down.
    const card = screen.getByTestId('highlight-0');
    expect(card).toHaveProp('pointerEvents', 'none');
    await waitFor(() => expect(card).toHaveProp('pointerEvents', 'auto'), {
      timeout: 8000,
      interval: 100,
    });

    // §9.10 share — a real Share.share call, never auto-posting.
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    await fireEvent.press(screen.getByTestId('highlight-0-share'));
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0]).toHaveProperty('message');
    shareSpy.mockRestore();

    await fireEvent.press(screen.getByTestId('return-home'));
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Tabs', params: { screen: 'Home' } }],
    });
  });

  it('a skipped set gets its own quiet outlined square, distinct from a completed (teal-filled) one', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const firstEntry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={mockNavigation() as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    const set0Log = firstEntry.setLogs.find((l) => l.setIndex === 0)!;
    const set1Log = firstEntry.setLogs.find((l) => l.setIndex === 1)!;
    const bg = (testID: string): unknown =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style)?.backgroundColor;
    // The skipped square and the completed square are colored differently, and neither reads as
    // the other — a skipped set is a choice, not a failed attempt at the completed one's color.
    const skippedBg = bg(`summary-set-${set0Log.id}`);
    const completedBg = bg(`summary-set-${set1Log.id}`);
    expect(skippedBg).toBeDefined();
    expect(completedBg).toBeDefined();
    expect(skippedBg).not.toBe(completedBg);
  });

  it('a set line is pressable, and jumps back to exactly that bookmark', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const firstEntry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    const skippedSetLog = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.id === firstEntry.id)!.setLogs[0]!;
    await fireEvent.press(screen.getByTestId(`summary-set-${skippedSetLog.id}`));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      jumpTo: { entryId: firstEntry.id, setIndex: 0 },
    });
  });

  it('mid-workout, FINISH and the retrospective are hidden', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-live-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    // Nothing logged at all — a genuinely mid-workout, real-time progress check.
    const session = sessionsRepo.getSession(db, sessionId)!;
    const first = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('finish-button')).toBeNull();
    expect(screen.queryByTestId('retrospective-input')).toBeNull();
    // `first` is entirely untouched — its testID is the plan-level one, since there is no log yet.
    expect(screen.getByTestId(`summary-set-${first.id}-0`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`summary-set-${first.id}-0`));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      jumpTo: { entryId: first.id, setIndex: 0 },
    });
  });

  it('shows every set for an exercise not yet reached, as a dashed square, and lets you jump ahead to any of them', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-jump-ahead-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    // Nothing logged at all, so every entry after the first is entirely untouched — the case
    // that used to have no lines at all to tap.
    const session = sessionsRepo.getSession(db, sessionId)!;
    const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    const untouched = active.find((e) => e.sets >= 2)!;
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    const block = within(screen.getByTestId(`summary-${untouched.exerciseId}`));
    // Every set gets a square — a dashed outline, not a "not reached" text label (the state is
    // in its accessibility label only).
    expect(block.getByLabelText('Set 1 — not reached')).toBeTruthy();
    expect(block.getByLabelText('Set 2 — not reached')).toBeTruthy();
    expect(block.queryByText(/not reached/i)).toBeNull();
    const flatStyle = (testID: string) =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style);
    expect(flatStyle(`summary-set-${untouched.id}-0`)).toMatchObject({ borderStyle: 'dashed' });
    const bg = (testID: string): unknown =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style)?.backgroundColor;
    expect(bg(`summary-set-${untouched.id}-0`)).toBe(bg(`summary-set-${untouched.id}-1`));

    await fireEvent.press(screen.getByTestId(`summary-set-${untouched.id}-1`));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      jumpTo: { entryId: untouched.id, setIndex: 1 },
    });
  });

  it('shows one feedback chip per exercise, and editing it from Summary updates the exercise — before FINISH, not after', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-feedback-edit-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    const session = sessionsRepo.getSession(db, sessionId)!;
    const mainEntry = session.entries.find(
      (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval' && e.sets >= 2,
    )!;
    for (const setIndex of [0, 1]) {
      sessionsRepo.logSet(
        db,
        {
          entryId: mainEntry.id,
          setIndex,
          status: 'completed',
          restPrescribedSec: mainEntry.restSec,
        },
        utcInstant,
      );
    }
    sessionsRepo.recordEntryFeedback(db, mainEntry.id, { difficulty: 'too_hard' }, utcInstant);

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={mockNavigation() as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('finish-button')).toBeNull(); // mid-workout editing, pre-FINISH
    const freshEntry = () =>
      sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === mainEntry.id)!;
    // One chip for the exercise, not a dot per set.
    expect(screen.getByTestId(`summary-feedback-difficulty-${mainEntry.id}`)).toBeTruthy();
    expect(screen.queryByLabelText(/^Set \d felt:/)).toBeNull();

    await fireEvent.press(screen.getByTestId(`summary-feedback-difficulty-${mainEntry.id}`));
    await waitFor(
      () => expect(screen.getByText('How did those 2 sets feel?')).toBeTruthy(),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('difficulty-just_right'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    expect(freshEntry().difficultyFeedback).toBe('just_right');
  });

  it('shows a placeholder chip for an exercise with no feedback yet, and tapping it records one retroactively', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-feedback-placeholder-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    const session = sessionsRepo.getSession(db, sessionId)!;
    const mainEntry = session.entries.find(
      (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval' && e.sets >= 2,
    )!;
    for (const setIndex of [0, 1]) {
      sessionsRepo.logSet(
        db,
        {
          entryId: mainEntry.id,
          setIndex,
          status: 'completed',
          restPrescribedSec: mainEntry.restSec,
        },
        utcInstant,
      );
    }
    // Both sets done, but the rest screen's question was never answered.

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={mockNavigation() as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('finish-button')).toBeNull(); // mid-workout editing, pre-FINISH
    const freshEntry = () =>
      sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === mainEntry.id)!;
    expect(screen.queryByTestId(`summary-feedback-difficulty-${mainEntry.id}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`summary-feedback-placeholder-${mainEntry.id}`));
    await waitFor(() => expect(screen.getByTestId('difficulty-too_easy')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    expect(freshEntry().difficultyFeedback).toBe('too_easy');
    expect(screen.queryByTestId(`summary-feedback-placeholder-${mainEntry.id}`)).toBeNull();
    expect(screen.getByTestId(`summary-feedback-difficulty-${mainEntry.id}`)).toBeTruthy();
  });

  it('mid-workout, "Back to workout" resumes at the front edge — no reviewFromSummary', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-live-back-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    // Nothing logged — a real front edge, so this is the mid-workout case, not the pre-FINISH one.
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('back-to-workout'));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', { sessionId });
  });

  it('mid-workout, the header back button (not just the in-page one) returns to the set it arrived from, and the swipe-back gesture is disabled', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-header-back-live-seed')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    // Nothing logged — a genuine mid-workout front edge, the case the reported bug was about:
    // Workout is `replace`d out of the stack by the "Progress" button, so the native back chevron
    // and iOS edge-swipe have nothing correct left to pop to unless this screen overrides them.
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(navigation.setOptions).toHaveBeenCalled(), WAIT_OPTS);
    const lastOptions = navigation.setOptions.mock.calls.at(-1)![0];
    expect(lastOptions.gestureEnabled).toBe(false);
    const headerView = await render(lastOptions.headerLeft());
    fireEvent.press(headerView.getByTestId('summary-back'));
    // Same target the in-page "Back to workout" button uses for this case: resume at the front
    // edge, not a forced reviewFromSummary jump to the last set (there is nothing logged yet).
    expect(navigation.replace).toHaveBeenCalledWith('Workout', { sessionId });
  }, 20000);

  it('pre-FINISH with everything logged, the header back button lands on the last set, matching "Back to workout"', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(navigation.setOptions).toHaveBeenCalled(), WAIT_OPTS);
    const lastOptions = navigation.setOptions.mock.calls.at(-1)![0];
    expect(lastOptions.gestureEnabled).toBe(false);
    const headerView = await render(lastOptions.headerLeft());
    fireEvent.press(headerView.getByTestId('summary-back'));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      reviewFromSummary: true,
    });
  });

  it('once FINISH has run, the header back override is lifted — there is nothing active left to return to', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('finish-button'));
    await waitFor(
      () =>
        expect(navigation.setOptions).toHaveBeenLastCalledWith({
          gestureEnabled: true,
          headerLeft: undefined,
        }),
      WAIT_OPTS,
    );
  });

  it('the retrospective keyboard has its own Done button, distinct from typing a newline', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={mockNavigation() as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('retrospective-done')).toBeTruthy(), WAIT_OPTS);
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    await fireEvent.press(screen.getByTestId('retrospective-done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    dismissSpy.mockRestore();
  });

  it('offers a way back to the still-active workout before FINISH, gone once FINISH is tapped', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
    // Still active in the DB — nothing has been finalized by just being on this screen.
    expect(sessionsRepo.getSession(db, sessionId)!.status).toBe('active');

    await fireEvent.press(screen.getByTestId('back-to-workout'));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      reviewFromSummary: true,
    });

    // Once FINISH has run, the session is completed and there is nothing active to go back to —
    // the button is specific to the pre-FINISH screens, which don't have it.
    await fireEvent.press(screen.getByTestId('finish-button'));
    await waitFor(() => expect(screen.getByTestId('return-home')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('back-to-workout')).toBeNull();
  });

  it('the completion screen is a celebration — confetti, a hype headline, and the running workout count', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // Complete one prior workout directly against the store, so the one under test is the
    // user's 2nd — proves the ordinal reads from real completed-session history, not a stub.
    const priorId = await createSessionWithASkippedFirstSet(db);
    completeSession(
      db,
      { sessionId: priorId, library: exerciseLibrary, families: familyLibrary },
      nowUtcInstant(),
    );

    // The test db is shared across cases in this file, so assert against the real count rather
    // than assuming this is the user's literal 2nd workout ever.
    const n = sessionsRepo.countCompletedSessions(db) + 1;
    const suffix = [11, 12, 13].includes(n % 100)
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
    const expectedOrdinal = `${n}${suffix}`;

    const sessionId = await createSessionWithASkippedFirstSet(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('finish-button'));

    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('confetti-burst')).toBeTruthy();
    expect(screen.getByTestId('hype-headline')).toBeTruthy();
    expect(screen.getByTestId('workout-count')).toHaveTextContent(
      `You just finished your ${expectedOrdinal} workout on RoamFit!`,
    );
  });

  it('the completion screen shows what actually happened, matching the real logged sets', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createSessionWithASkippedFirstSet(db);
    // The independent source of truth: fold the same real logged session the same way
    // sessionStats.ts does, computed here from the store directly rather than from the screen, so
    // this is a real cross-check and not the screen grading its own homework.
    const expected = buildSessionCompletionStats(sessionsRepo.getSession(db, sessionId)!);

    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <SummaryScreen
            navigation={navigation as never}
            route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('finish-button'));

    await waitFor(() => expect(screen.getByTestId('completion-stats')).toBeTruthy(), WAIT_OPTS);
    // Each tile counts up on its own stagger (see the render's `delay={i * 130}`) — wait for each
    // one to finish landing independently rather than assuming they all settle together.
    await waitFor(
      () =>
        expect(screen.getByTestId('completion-stat-sets-value')).toHaveTextContent(
          `${expected.setsCompleted}`,
        ),
      WAIT_OPTS,
    );
    await waitFor(
      () =>
        expect(screen.getByTestId('completion-stat-exercises-value')).toHaveTextContent(
          `${expected.exercisesTrained}`,
        ),
      WAIT_OPTS,
    );
    // This fixture logs real reps/seconds on every completed set (see the helper above), so at
    // least one of these dimensions is real and present — assert whichever applies rather than
    // assuming a specific exercise mix, which is generation-seed-dependent.
    if (expected.totalReps > 0) {
      await waitFor(
        () =>
          expect(screen.getByTestId('completion-stat-reps-value')).toHaveTextContent(
            `${expected.totalReps}`,
          ),
        WAIT_OPTS,
      );
    }
    if (expected.totalSeconds > 0) {
      await waitFor(
        () =>
          expect(screen.getByTestId('completion-stat-seconds-value')).toHaveTextContent(
            `${expected.totalSeconds}s`,
          ),
        WAIT_OPTS,
      );
    }
  });

  // The headline's word count decides WHEN the first Light tick lands: an N-word headline ticks
  // once per word except the last, so a ONE-word headline ("UNSTOPPABLE!" — one of the eight in
  // the pool, picked from the session's random id) has no word ticks at all and its first Light
  // comes from the stat tiles, ~450ms AFTER the Heavy slam. This test used to assert Light the
  // instant Heavy arrived, so it failed for ~1 session id in 8 regardless of load. Both shapes are
  // pinned here so the ordering assumption can never hide behind a lucky id again.
  it.each([
    ['a one-word headline (no word ticks)', 'UNSTOPPABLE!'],
    ['a multi-word headline (a tick per word)', 'ABSOLUTE BEAST MODE!'],
  ])(
    'fires the fanfare/haptic sequence exactly once when the completion screen appears, with %s',
    async (_label, headline) => {
      const actualPick = jest.requireActual('../lib/celebration').pickHypeHeadline;
      (pickHypeHeadline as jest.Mock).mockReturnValue(headline);
      const notify = jest.spyOn(Haptics, 'notificationAsync');
      const impact = jest.spyOn(Haptics, 'impactAsync');
      try {
        let db!: ReturnType<typeof useStore>['db'];
        render(
          <StoreProvider>
            <Setup onReady={(d) => (db = d)} />
          </StoreProvider>,
        );
        await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
        const sessionId = await createSessionWithASkippedFirstSet(db);

        const navigation = mockNavigation();
        render(
          <StoreProvider>
            <NavigationContainer>
              <SummaryScreen
                navigation={navigation as never}
                route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
              />
            </NavigationContainer>
          </StoreProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), WAIT_OPTS);
        await fireEvent.press(screen.getByTestId('finish-button'));
        await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);

        // Exactly once: the arrival fanfare is the one Success on screen appearance; the next
        // Success (the button's beat) is over a second away.
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);

        // Then the escalating sequence — each beat awaited on its own, never assumed to have
        // happened because a later one did: a Heavy slam, a Light tick (word ticks, or the stat
        // tiles' when there is only one word), and the button's own Success at the end.
        const eventually = { timeout: 8000, interval: 50 };
        await waitFor(
          () => expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy),
          eventually,
        );
        await waitFor(
          () => expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light),
          eventually,
        );
        await waitFor(() => expect(notify.mock.calls.length).toBeGreaterThanOrEqual(2), eventually);
      } finally {
        (pickHypeHeadline as jest.Mock).mockImplementation(actualPick);
        notify.mockRestore();
        impact.mockRestore();
      }
    },
  );
});
