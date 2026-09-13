/**
 * §8.1 warm-up/cool-down feedback — every set gets its own rest timer and its own difficulty
 * question, exactly like `main`. This replaced the earlier "one question for the whole stage,
 * asked once at the end" design (a single `StageFeedbackPhase` page with no countdown and no
 * rest controls) — that page is gone; a warm-up or cool-down set now runs through the same
 * `RestPhase` a main set always has. Driven through the real WorkoutScreen against the real
 * store: the point of this file is *where the screen goes* after a set, which is a property of
 * the screen's phase machine and not of any component in isolation.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { eq } from 'drizzle-orm';
import { generate, schema, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
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

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

function activeEntries(session: sessionsRepo.SessionRecord) {
  return session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
}

function logSet(db: Db, entry: sessionsRepo.SessionEntryRecord, setIndex: number) {
  sessionsRepo.logSet(
    db,
    {
      entryId: entry.id,
      setIndex,
      status: 'completed',
      repsPrescribed: entry.repTarget ?? undefined,
      secondsPrescribed: entry.durationSec ?? undefined,
      repsActual: entry.repTarget ?? undefined,
      secondsActual: entry.durationSec ?? undefined,
      restPrescribedSec: entry.restSec,
    },
    nowUtcInstant(),
  );
}

/**
 * A started session parked on the very last set of `section`, with every set before it logged and
 * every warm-up/cool-down entry forced to reps (a timed entry would need its countdown waited out,
 * which has nothing to do with what this file is testing).
 */
async function sessionAtLastSetOf(db: Db, seed: string, section: 'warmup' | 'cooldown') {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 60 },
    clock,
    rng: createRng(seedFromString(seed)),
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
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());

  const preSession = sessionsRepo.getSession(db, sessionId)!;
  const preSectionEntries = activeEntries(preSession).filter((e) => e.section === section);
  // The set under test is completed with one tap. Whether the generator happened to make the last
  // slot of this stage a timed hold is irrelevant to where the screen goes next, and waiting out a
  // real countdown to find out would only make this test slow and flaky.
  db.update(schema.sessionEntries)
    .set({ durationSec: null, repTarget: 10, unilateral: false, sets: 1 })
    .where(eq(schema.sessionEntries.id, preSectionEntries[preSectionEntries.length - 1]!.id))
    .run();

  const session = sessionsRepo.getSession(db, sessionId)!;
  const entries = activeEntries(session);
  const sectionEntries = entries.filter((e) => e.section === section);
  const last = sectionEntries[sectionEntries.length - 1]!;

  // Everything before the last set of the last entry in `section`.
  for (const entry of entries) {
    if (entry.id === last.id) break;
    for (let i = 0; i < entry.sets; i++) logSet(db, entry, i);
  }
  for (let i = 0; i < last.sets - 1; i++) logSet(db, last, i);

  return { sessionId, lastEntryId: last.id };
}

function renderWorkout(sessionId: string, navigation: ReturnType<typeof mockNavigation>) {
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={navigation as never}
        route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
      />
    </StoreProvider>,
  );
}

describe('§8.1 warm-up/cool-down feedback: every set, own rest timer and own question', () => {
  it('finishing a warm-up set (last one in the stage or not) goes to an ordinary rest page with its own feedback controls', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, lastEntryId } = await sessionAtLastSetOf(db, 'stage-warmup-seed', 'warmup');

    renderWorkout(sessionId, mockNavigation());
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // A rest page, with its own timer and its own feedback question — no separate stage page.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
    expect(screen.getByTestId('difficulty-too_easy')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      const entry = after.entries.find((e) => e.id === lastEntryId)!;
      const log = entry.setLogs.find((l) => l.setIndex === entry.sets - 1);
      expect(log?.difficultyFeedback).toBe('too_easy');
    }, WAIT_OPTS);
  }, 20000);

  it('a warm-up set that is not the last one in its stage also gets a rest timer and feedback controls', async () => {
    let db!: Db;
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 60 },
      clock,
      rng: createRng(seedFromString('stage-midwarmup-seed')),
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
    sessionsRepo.startSession(db, sessionId, nowUtcInstant());

    const session = sessionsRepo.getSession(db, sessionId)!;
    const warmup = activeEntries(session).filter((e) => e.section === 'warmup');
    expect(warmup.length).toBeGreaterThan(1);

    renderWorkout(sessionId, mockNavigation());
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('difficulty-too_easy')).toBeTruthy();
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
  }, 20000);

  it('the last cool-down set gets its own rest page too, and Next is what ends the workout', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, lastEntryId } = await sessionAtLastSetOf(
      db,
      'stage-cooldown-seed',
      'cooldown',
    );

    const navigation = mockNavigation();
    renderWorkout(sessionId, navigation);
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // Every set in the plan is now logged, but the last set's own rest page is still owed before
    // the screen moves on to Summary.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('difficulty-too_hard'));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      const entry = after.entries.find((e) => e.id === lastEntryId)!;
      const log = entry.setLogs.find((l) => l.setIndex === entry.sets - 1);
      expect(log?.difficultyFeedback).toBe('too_hard');
    }, WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('rest-next'));
    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);

  it('skipping every set of the warm-up carries no feedback and no rest, and there is no stage page to land on', async () => {
    let db!: Db;
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 60 },
      clock,
      rng: createRng(seedFromString('stage-allskipped-seed')),
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
    sessionsRepo.startSession(db, sessionId, nowUtcInstant());

    const session = sessionsRepo.getSession(db, sessionId)!;
    const warmup = activeEntries(session).filter((e) => e.section === 'warmup');
    const warmupSlots = warmup.reduce((n, e) => n + e.sets, 0);

    renderWorkout(sessionId, mockNavigation());
    await waitFor(() => expect(screen.getByTestId('skip-set')).toBeTruthy(), WAIT_OPTS);

    for (let i = 0; i < warmupSlots; i++) {
      await fireEvent.press(screen.getByTestId('skip-set'));
      await waitFor(
        () => expect(sessionsRepo.getSession(db, sessionId)!.entries.flatMap((e) => e.setLogs)),
        WAIT_OPTS,
      );
    }

    // Every warm-up slot was waved past — a skip never routes through rest, whatever the section.
    await waitFor(() => {
      const logs = sessionsRepo
        .getSession(db, sessionId)!
        .entries.filter((e) => e.section === 'warmup')
        .flatMap((e) => e.setLogs);
      expect(logs).toHaveLength(warmupSlots);
      expect(logs.every((l) => l.status === 'skipped')).toBe(true);
    }, WAIT_OPTS);
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
    expect(screen.queryByTestId('rest-circle')).toBeNull();
  }, 30000);
});
