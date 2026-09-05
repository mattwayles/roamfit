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
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
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
  const entry = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
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
    // The skipped set says so. It used to render as "⚠ Set 1: — sec", which reads like a set that
    // was performed and measured nothing.
    expect(screen.getByText(/Set 1: Skipped/)).toBeTruthy();
    expect(screen.queryByText(/Set 1: — /)).toBeNull();
    // The set that was actually trained still reports what was done.
    expect(screen.getByText(/Set 2: \d+ (reps|sec)/)).toBeTruthy();
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
});
