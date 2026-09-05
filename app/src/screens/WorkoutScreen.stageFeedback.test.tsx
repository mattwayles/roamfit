/**
 * §8.1 stage feedback — one question for the whole warm-up, and one for the whole cool-down,
 * instead of one per exercise inside them. Driven through the real WorkoutScreen against the real
 * store: the point of this file is *where the screen goes* after a set, which is a property of the
 * screen's phase machine and not of any component in isolation.
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

  return { sessionId, sectionEntryIds: sectionEntries.map((e) => e.id) };
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

describe('§8.1 stage feedback: one question per warm-up and per cool-down', () => {
  it('finishing the warm-up asks once for the whole stage, with no rest timer or rest controls, and writes the answer to every warm-up entry', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, sectionEntryIds } = await sessionAtLastSetOf(
      db,
      'stage-warmup-seed',
      'warmup',
    );
    expect(sectionEntryIds.length).toBeGreaterThan(1); // otherwise "per stage" proves nothing

    renderWorkout(sessionId, mockNavigation());
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // The stage page, not a rest page.
    await waitFor(() => expect(screen.getByTestId('stage-feedback')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('stage-feedback-title')).toHaveTextContent('How was the warm-up?');
    expect(screen.queryByTestId('rest-circle')).toBeNull();
    expect(screen.queryByTestId('rest-plus-15')).toBeNull();
    expect(screen.queryByTestId('rest-minus-15')).toBeNull();
    expect(screen.queryByTestId('rest-skip')).toBeNull();
    expect(screen.queryByTestId('rest-next')).toBeNull();

    // One answer, landing on every entry in the stage — that is what "for the whole warm-up"
    // means once it reaches the store.
    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await fireEvent.press(screen.getByTestId('enjoyment-4'));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      for (const id of sectionEntryIds) {
        const entry = after.entries.find((e) => e.id === id)!;
        expect(entry.difficultyFeedback).toBe('too_easy');
        expect(entry.enjoymentFeedback).toBe(4);
      }
    }, WAIT_OPTS);

    // Continue hands off to the next stage.
    await fireEvent.press(screen.getByTestId('stage-feedback-done'));
    await waitFor(() => expect(screen.queryByTestId('stage-feedback')).toBeNull(), WAIT_OPTS);
  }, 20000);

  it('a warm-up set that is not the last one goes to a rest page carrying no feedback controls', async () => {
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

    // Still inside the warm-up, so this is an ordinary rest — but the per-exercise question it
    // used to carry is gone; that is now asked once, at the end of the stage.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('difficulty-too_easy')).toBeNull();
    expect(screen.queryByTestId('enjoyment-4')).toBeNull();
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
  }, 20000);

  it('the cool-down question is asked before the summary, and Continue is what ends the workout', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, sectionEntryIds } = await sessionAtLastSetOf(
      db,
      'stage-cooldown-seed',
      'cooldown',
    );

    const navigation = mockNavigation();
    renderWorkout(sessionId, navigation);
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // Every set in the plan is now logged, so the screen would otherwise have gone straight to
    // Summary. The cool-down's one question comes first.
    await waitFor(() => expect(screen.getByTestId('stage-feedback')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('stage-feedback-title')).toHaveTextContent('How was the cool-down?');
    expect(navigation.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('enjoyment-5'));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      for (const id of sectionEntryIds) {
        expect(after.entries.find((e) => e.id === id)!.enjoymentFeedback).toBe(5);
      }
    }, WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('stage-feedback-done'));
    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);

  it('a stage nobody trained is never asked about — skipping every set of it goes straight on', async () => {
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

    // Every warm-up slot was waved past, so there is nothing to ask how it felt about.
    await waitFor(() => {
      const logs = sessionsRepo
        .getSession(db, sessionId)!
        .entries.filter((e) => e.section === 'warmup')
        .flatMap((e) => e.setLogs);
      expect(logs).toHaveLength(warmupSlots);
      expect(logs.every((l) => l.status === 'skipped')).toBe(true);
    }, WAIT_OPTS);
    expect(screen.queryByTestId('stage-feedback')).toBeNull();
  }, 30000);
});
