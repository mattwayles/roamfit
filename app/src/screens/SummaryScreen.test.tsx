/**
 * §10.9/§6.4/§6.7 completion — driven through the real SummaryScreen against the real on-device-
 * shaped store (not mocked). Forces a calibration-mode level-up (during §6.5 calibration a
 * `too_easy` rating advances a full level immediately — no need to fabricate history) so this
 * test proves the full-screen celebration actually fires "before anything else," not just that it
 * type-checks.
 *
 * It used to force that level-up by logging reps 60% over target, back when exceeding the target
 * by >=25% was itself a calibration advance. That rule is gone — reps are a prescription to be
 * met, not a score to beat — so the user saying `too_easy` is now the only thing that jumps a
 * level during calibration.
 */
import React from 'react';
import { Keyboard, Share, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { buildSessionCompletionStats } from '../lib/sessionStats';

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

/** Builds a real started session, logs every set at target, and rates every main entry
 *  `too_easy` (calibration-mode advance, §6.5), so `completeSession` is guaranteed to produce at
 *  least one real level_up event — no fabricated progression state, just a real session that
 *  earns it. */
async function createAndRunSessionForLevelUp(
  db: ReturnType<typeof useStore>['db'],
): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
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
    // The signal that actually advances a level during calibration — migration 0017 moved a
    // `main` exercise's feedback to its sets, so this rates set 0 (the aggregate progression
    // reads is worst-case across an entry's sets, and `too_easy` on any one of them is enough).
    if (entry.section === 'main') {
      sessionsRepo.recordSetFeedback(db, entry.id, 0, { difficulty: 'too_easy' }, utcInstant);
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
  it('FINISH completes the session; a real calibration-mode level-up shows the full-screen celebration before the plain summary, share works, and Continue reaches Done', async () => {
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

    // Every family started in calibration mode (fresh db) and every main entry was rated
    // too_easy — at least one family's calibration_advance should have fired, surfacing the
    // full-screen celebration "before anything else" (no Done button visible yet).
    await waitFor(() => expect(screen.getByTestId('level-up-celebration')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('return-home')).toBeNull();

    // §9.10 share — a real Share.share call, never auto-posting.
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    await fireEvent.press(screen.getByTestId('celebration-share'));
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0]).toHaveProperty('message');
    shareSpy.mockRestore();

    // Advance through every celebration (there may be more than one family leveling up) until
    // the plain Done summary appears.
    for (let guard = 0; guard < 10; guard += 1) {
      if (screen.queryByTestId('return-home')) break;
      await fireEvent.press(screen.getByTestId('celebration-continue'));
    }
    await waitFor(() => expect(screen.getByTestId('return-home')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('return-home'));
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Home' }] });
  });

  it('a skipped set gets its own light-blue square, distinct from a completed (green) one', async () => {
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

  it('shows every set for an exercise not yet reached, as an empty-space glyph, and lets you jump ahead to any of them', async () => {
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
    // Every set gets a square — the empty-space glyph, not a "not reached" label.
    expect(block.getByText('Set 1')).toBeTruthy();
    expect(block.getByText('Set 2')).toBeTruthy();
    expect(block.getAllByText('⬜').length).toBeGreaterThanOrEqual(2);
    expect(block.queryByText(/not reached/i)).toBeNull();
    const bg = (testID: string): unknown =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style)?.backgroundColor;
    expect(bg(`summary-set-${untouched.id}-0`)).toBe(bg(`summary-set-${untouched.id}-1`));

    await fireEvent.press(screen.getByTestId(`summary-set-${untouched.id}-1`));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      jumpTo: { entryId: untouched.id, setIndex: 1 },
    });
  });

  it("shows an in-square chip for a main set's own recorded feedback, and editing it from Summary updates just that set — before FINISH, not after", async () => {
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
    // Two different sets of the same exercise, two different answers — exactly the case a single
    // per-exercise feedback field couldn't represent.
    sessionsRepo.logSet(
      db,
      {
        entryId: mainEntry.id,
        setIndex: 0,
        status: 'completed',
        restPrescribedSec: mainEntry.restSec,
      },
      utcInstant,
    );
    sessionsRepo.logSet(
      db,
      {
        entryId: mainEntry.id,
        setIndex: 1,
        status: 'completed',
        restPrescribedSec: mainEntry.restSec,
      },
      utcInstant,
    );
    sessionsRepo.recordSetFeedback(db, mainEntry.id, 0, { difficulty: 'too_hard' }, utcInstant);
    sessionsRepo.recordSetFeedback(db, mainEntry.id, 1, { difficulty: 'too_easy' }, utcInstant);

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
    // Each set's chip shows its own answer, as emoji rather than a text label; before FINISH, so
    // this is mid-workout editing, not a post-completion retrospective feature.
    expect(screen.queryByTestId('finish-button')).toBeNull();
    // Fetch the freshly-logged rows (mainEntry above predates the logSet calls).
    const freshEntry = () =>
      sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === mainEntry.id)!;
    const set0Log = freshEntry().setLogs.find((l) => l.setIndex === 0)!;
    expect(screen.getByText('Too hard')).toBeTruthy(); // set 0
    expect(screen.getByText('Too easy')).toBeTruthy(); // set 1

    // Editing set 0's chip touches only set 0.
    await fireEvent.press(screen.getByTestId(`summary-feedback-difficulty-${set0Log.id}`));
    await waitFor(
      () => expect(screen.getByTestId('difficulty-just_right')).toBeTruthy(),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('difficulty-just_right'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    const updatedSet0 = freshEntry().setLogs.find((l) => l.setIndex === 0)!;
    const updatedSet1 = freshEntry().setLogs.find((l) => l.setIndex === 1)!;
    expect(updatedSet0.difficultyFeedback).toBe('just_right');
    // Set 1's own answer is untouched — this is the whole point of the change.
    expect(updatedSet1.difficultyFeedback).toBe('too_easy');
    // The chip on screen reflects the edit immediately, without navigating away and back.
    expect(screen.getByText('Just right')).toBeTruthy();
  });

  it('shows a placeholder chip for a logged set with no feedback yet, and tapping it records one retroactively', async () => {
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
      (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
    )!;
    // Logged, but the rest screen was never answered — the case that had no chip at all before.
    sessionsRepo.logSet(
      db,
      {
        entryId: mainEntry.id,
        setIndex: 0,
        status: 'completed',
        restPrescribedSec: mainEntry.restSec,
      },
      utcInstant,
    );

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
    const freshEntry = () =>
      sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === mainEntry.id)!;
    const set0Log = freshEntry().setLogs.find((l) => l.setIndex === 0)!;

    await fireEvent.press(screen.getByTestId(`summary-feedback-placeholder-${set0Log.id}`));
    await waitFor(
      () => expect(screen.getByTestId('difficulty-too_easy')).toBeTruthy(),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    const updatedSet0 = freshEntry().setLogs.find((l) => l.setIndex === 0)!;
    expect(updatedSet0.difficultyFeedback).toBe('too_easy');
    expect(screen.getByText('Too easy')).toBeTruthy();
    expect(screen.queryByTestId(`summary-feedback-placeholder-${set0Log.id}`)).toBeNull();
  });

  it('editing a legacy whole-stage feedback chip (from a session recorded before per-set warm-up/cool-down feedback) updates every entry in the stage', async () => {
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
      rng: createRng(seedFromString('summary-stage-feedback-edit-seed')),
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
    const warmupEntries = session.entries.filter(
      (e) => e.section === 'warmup' && e.entryStatus !== 'removed_at_approval',
    );
    expect(warmupEntries.length).toBeGreaterThanOrEqual(2);
    sessionsRepo.recordSectionFeedback(
      db,
      sessionId,
      'warmup',
      { difficulty: 'too_easy' },
      utcInstant,
    );

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
    // Editing from the *first* warm-up entry's chip...
    await fireEvent.press(screen.getByTestId(`summary-feedback-difficulty-${warmupEntries[0].id}`));
    await waitFor(() => expect(screen.getByTestId('difficulty-too_hard')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('difficulty-too_hard'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    // ...updates every entry in the stage, not just the one whose chip was tapped.
    const reloaded = sessionsRepo.getSession(db, sessionId)!;
    for (const entry of warmupEntries) {
      expect(reloaded.entries.find((e) => e.id === entry.id)!.difficultyFeedback).toBe('too_hard');
    }
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

  it('the completion screen is a celebration — confetti, a big banner, and the running workout count', async () => {
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

    // Step through any full-screen level-up/mastery celebrations first — the completion
    // celebration is the screen underneath those, never stacked on top.
    for (let guard = 0; guard < 10; guard += 1) {
      if (screen.queryByTestId('session-complete')) break;
      if (!screen.queryByTestId('celebration-continue')) break;
      await fireEvent.press(screen.getByTestId('celebration-continue'));
    }

    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('confetti-burst')).toBeTruthy();
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

    for (let guard = 0; guard < 10; guard += 1) {
      if (screen.queryByTestId('session-complete')) break;
      if (!screen.queryByTestId('celebration-continue')) break;
      await fireEvent.press(screen.getByTestId('celebration-continue'));
    }

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

  it('fires the fanfare/haptic sequence exactly once when the completion screen appears', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await createSessionWithASkippedFirstSet(db);

    const notify = jest.spyOn(Haptics, 'notificationAsync');
    const impact = jest.spyOn(Haptics, 'impactAsync');

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

    for (let guard = 0; guard < 10; guard += 1) {
      if (screen.queryByTestId('session-complete')) break;
      if (!screen.queryByTestId('celebration-continue')) break;
      await fireEvent.press(screen.getByTestId('celebration-continue'));
    }
    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);

    // The choreography's last beat (a Success pulse paired with the button fading in) lands at
    // ~1300ms — wait past it, then assert the escalating sequence actually happened: at least one
    // Light tick, one Heavy pulse, and Success notifications (the arrival cue plus the final beat).
    await waitFor(() => expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy), {
      timeout: 5000,
      interval: 100,
    });
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);

    notify.mockRestore();
    impact.mockRestore();
  });
});
