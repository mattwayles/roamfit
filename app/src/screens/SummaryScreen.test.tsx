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
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

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

  it('mid-workout, FINISH and the retrospective are hidden and a distinguished square marks where the user currently is', async () => {
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
    expect(screen.getByTestId(`summary-current-${first.id}`)).toBeTruthy();
    expect(screen.getByText('You are here')).toBeTruthy();
    // The square standing in for set 1 (`first` is entirely untouched) is the one carrying the
    // "you are here" label — its testID is the plan-level one, since there is no log yet.
    expect(screen.getByTestId(`summary-set-${first.id}-0`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`summary-current-${first.id}`));
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

  it('a persisted cursor moves the "you are here" marker to the selected set, overriding the derived front edge', async () => {
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
      rng: createRng(seedFromString('summary-cursor-seed')),
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
    const first = active[0]!;
    const second = active[1]!;
    // The derived front edge is still `first` set 0 — nothing has been logged. A prior visit to
    // Workout via a Summary bookmark set the override onto a *different, later* entry, which is
    // the "regardless of how much of a workout has been completed" case: the override wins even
    // though the workout has barely started.
    sessionsRepo.setSessionCursor(db, sessionId, { entryId: second.id, setIndex: 0 }, utcInstant);

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
    // The marker sits on the overridden entry, not on `first` (the derived front edge).
    expect(screen.queryByTestId(`summary-current-${first.id}`)).toBeNull();
    expect(screen.getByTestId(`summary-current-${second.id}`)).toBeTruthy();
    expect(screen.getByText('You are here')).toBeTruthy();
  });

  it('when the cursor lands on an already-logged (e.g. skipped) set, its line becomes the "you are here" marker instead of a separate duplicate line', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // A still-in-progress session (frontier non-null — the marker is only ever shown pre-FINISH):
    // set 1 skipped, set 2 trained, set 3+ not reached yet. The cursor is pointed back at the
    // already-skipped set 1, the exact device report — the front edge has moved on to a later
    // set, but a Summary tap on set 1 still has to win.
    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('summary-cursor-on-skip-seed')),
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
    const firstEntry = active.find((e) => e.sets >= 3)!;
    sessionsRepo.logSet(
      db,
      {
        entryId: firstEntry.id,
        setIndex: 0,
        status: 'skipped',
        repsPrescribed: firstEntry.repTarget ?? undefined,
        secondsPrescribed: firstEntry.durationSec ?? undefined,
        restPrescribedSec: firstEntry.restSec,
      },
      utcInstant,
    );
    sessionsRepo.logSet(
      db,
      {
        entryId: firstEntry.id,
        setIndex: 1,
        status: 'completed',
        repsPrescribed: firstEntry.repTarget ?? undefined,
        secondsPrescribed: firstEntry.durationSec ?? undefined,
        repsActual: firstEntry.repTarget ?? undefined,
        secondsActual: firstEntry.durationSec ?? undefined,
        restPrescribedSec: firstEntry.restSec,
      },
      utcInstant,
    );
    sessionsRepo.setSessionCursor(
      db,
      sessionId,
      { entryId: firstEntry.id, setIndex: 0 },
      utcInstant,
    );

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
    // Exactly one marker for this entry, and it replaces the skipped square rather than sitting
    // underneath it — the square for set 1 carries the "you are here" label directly, on the
    // set's own logged testID (not a separate plan-level one), since it does have a log.
    expect(screen.getAllByTestId(`summary-current-${firstEntry.id}`)).toHaveLength(1);
    const skippedLog = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.id === firstEntry.id)!
      .setLogs.find((l) => l.setIndex === 0)!;
    expect(screen.getByTestId(`summary-set-${skippedLog.id}`)).toBeTruthy();
    expect(screen.getByText('You are here')).toBeTruthy();
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
    sessionsRepo.recordSetFeedback(
      db,
      mainEntry.id,
      0,
      { difficulty: 'too_hard', enjoyment: 2 },
      utcInstant,
    );
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
    const set1Log = freshEntry().setLogs.find((l) => l.setIndex === 1)!;
    expect(screen.getByText('🥵')).toBeTruthy(); // set 0: too_hard
    expect(screen.getByText('😞')).toBeTruthy(); // set 0: enjoyment 2
    expect(screen.getByText('😌')).toBeTruthy(); // set 1: too_easy
    expect(screen.queryByTestId(`summary-feedback-enjoyment-${set1Log.id}`)).toBeNull(); // no enjoyment on set 1

    // Editing set 0's chip touches only set 0.
    await fireEvent.press(screen.getByTestId(`summary-feedback-difficulty-${set0Log.id}`));
    await waitFor(
      () => expect(screen.getByTestId('difficulty-just_right')).toBeTruthy(),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('difficulty-just_right'));
    await fireEvent.press(screen.getByTestId('enjoyment-5'));
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));

    const updatedSet0 = freshEntry().setLogs.find((l) => l.setIndex === 0)!;
    const updatedSet1 = freshEntry().setLogs.find((l) => l.setIndex === 1)!;
    expect(updatedSet0.difficultyFeedback).toBe('just_right');
    expect(updatedSet0.enjoymentFeedback).toBe(5);
    // Set 1's own answer is untouched — this is the whole point of the change.
    expect(updatedSet1.difficultyFeedback).toBe('too_easy');
    // The chip on screen reflects the edit immediately, without navigating away and back.
    expect(screen.getByText('👍')).toBeTruthy();
    expect(screen.getByText('😄')).toBeTruthy();
  });

  it('editing a warm-up/cool-down feedback chip updates the whole stage, since that is one answer shared by every entry in it', async () => {
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
});
