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
import { Keyboard, Share } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
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
    // The signal that actually advances a level during calibration.
    if (entry.section === 'main') {
      sessionsRepo.recordEntryFeedback(db, entry.id, { difficulty: 'too_easy' }, utcInstant);
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

  it('lists a skipped set as skipped, not as a set that happened and recorded nothing', async () => {
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
    const firstEntryBlock = within(screen.getByTestId(`summary-${firstEntry.exerciseId}`));
    // The skipped set says so. It used to render as "⚠ Set 1: — sec", which reads like a set that
    // was performed and measured nothing.
    expect(firstEntryBlock.getByText(/Set 1: Skipped/)).toBeTruthy();
    expect(firstEntryBlock.queryByText(/Set 1: — /)).toBeNull();
    // The set that was actually trained still reports what was done.
    expect(firstEntryBlock.getByText(/Set 2: \d+ (reps|sec)/)).toBeTruthy();
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

  it('mid-workout, FINISH and the retrospective are hidden and a bold line marks where the user currently is', async () => {
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
    expect(screen.getByText(/Set 1 — you are here/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`summary-current-${first.id}`));
    expect(navigation.replace).toHaveBeenCalledWith('Workout', {
      sessionId,
      jumpTo: { entryId: first.id, setIndex: 0 },
    });
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

  it('shows the band each set was actually trained with, per set, not one band per exercise', async () => {
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
      rng: createRng(seedFromString('summary-band-seed')),
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

    // A banded entry whose sets were NOT all trained with the same band — set 1 on B1, the rest
    // moved up to B3, which is exactly the case one band per exercise would misreport.
    const started = sessionsRepo.getSession(db, sessionId)!;
    const banded = started.entries.find(
      (e) => e.entryStatus !== 'removed_at_approval' && e.band != null && e.sets >= 2,
    )!;
    for (let i = 0; i < banded.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: banded.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: banded.repTarget ?? undefined,
          secondsPrescribed: banded.durationSec ?? undefined,
          repsActual: banded.repTarget ?? undefined,
          secondsActual: banded.durationSec ?? undefined,
          bandActual: i === 0 ? 'B1' : 'B3',
          restPrescribedSec: banded.restSec,
        },
        utcInstant,
      );
    }
    // Log every other entry in full too — SummaryScreen only shows FINISH once the front edge is
    // gone, and this test is about per-set band text, not partial-completion behavior.
    for (const e of started.entries.filter((x) => x.entryStatus !== 'removed_at_approval')) {
      if (e.id === banded.id) continue;
      for (let i = 0; i < e.sets; i += 1) {
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
    const tensions = usersRepo.ensureUser(db, utcInstant).bandTensions;
    // Whatever the user calls those bands is what the line says.
    expect(screen.getByText(new RegExp(`Set 1:.*${tensions.B1.label}`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`Set 2:.*${tensions.B3.label}`))).toBeTruthy();
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
