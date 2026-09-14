/**
 * Reported from the device: jump back (via the Summary/Progress bookmark) to a set that sits
 * behind the front edge — most noticeably one that was previously skipped — and Complete looked
 * like it did nothing.
 *
 * It wasn't a no-op: the log write always landed. What broke was what happened next —
 * `commitSetAndRest` unconditionally routed through the rest page using `entry`/`exercise`
 * recomputed *after* `reload()`, which is the real front edge, not the set that was just fixed.
 * For a bookmark far from the front edge that meant a rest screen previewing a completely
 * unrelated exercise, with no way to tell the correction had taken.
 *
 * That was fixed (an earlier version of this file) by skipping rest entirely and bouncing back to
 * Summary for any redo of an already-logged set. That overcorrected: pressing Complete on an
 * already-completed set is expected to reopen its own rest page like any other completion, not
 * dead-end at Summary. `restingEntryId`/`restingSetIndex` — captured right after the log write,
 * before `reload()` moves `entry` on — already point at the set just (re)completed regardless of
 * frontier position, so the unrelated-exercise problem above doesn't recur.
 */
import React from 'react';
import { eq } from 'drizzle-orm';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
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

async function freshDb(): Promise<Db> {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
  return db;
}

it('completing a previously-skipped set reached via a Summary bookmark writes it as completed and reopens its own rest page', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('retro-complete-seed')),
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
  const session0 = sessionsRepo.getSession(db, sessionId)!;
  const mains = session0.entries.filter(
    (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
  );
  const first = mains[0]!;
  db.update(schema.sessionEntries)
    .set({ sets: 2 })
    .where(eq(schema.sessionEntries.id, first.id))
    .run();
  sessionsRepo.startSession(db, sessionId, utcInstant);

  // Set 0 skipped, set 1 done — this entry is now behind the front edge, which has moved on.
  sessionsRepo.logSet(
    db,
    { entryId: first.id, setIndex: 0, status: 'skipped', restPrescribedSec: 45 },
    utcInstant,
  );
  sessionsRepo.logSet(
    db,
    { entryId: first.id, setIndex: 1, status: 'completed', repsActual: 10, restPrescribedSec: 45 },
    utcInstant,
  );

  const navigation = mockNavigation();
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={navigation as never}
        route={
          {
            key: 'Workout',
            name: 'Workout',
            params: { sessionId, jumpTo: { entryId: first.id, setIndex: 0 } },
          } as never
        }
      />
    </StoreProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));

  // The retroactive fix landed in the log.
  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    const log0 = s.entries.find((e) => e.id === first.id)!.setLogs.find((l) => l.setIndex === 0);
    expect(log0?.status).toBe('completed');
  }, WAIT_OPTS);

  // Its own rest page shows — no bounce back to Summary.
  await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
  expect(navigation.replace).not.toHaveBeenCalledWith('Summary', { sessionId });
}, 20000);

/**
 * Reported from the device: selecting any set from Summary and completing it bounced straight
 * back to Summary instead of showing that set's own rest page and continuing the workout.
 *
 * The `!wasAtFrontier` check above was too broad — it fired for *every* bookmark that wasn't the
 * literal derived front edge, including a bookmark onto a set nobody has reached yet (jumping
 * ahead). That set has no existing log to "correct"; completing it is a real, first-time
 * completion and deserves the same rest page any other completion gets. Only a bookmark onto a
 * set that already has a log (an actual redo/correction, covered above) should skip rest and land
 * back on Summary.
 */
it('completing a not-yet-reached set jumped to from Summary shows its own rest page rather than bouncing back to Summary', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('jump-ahead-complete-seed')),
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
  const session0 = sessionsRepo.getSession(db, sessionId)!;
  const mains = session0.entries.filter(
    (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
  );
  // Nothing logged at all — the front edge is `mains[0]` set 0. The bookmark below jumps ahead to
  // an entirely untouched later entry, not the derived front edge, but also not a redo of
  // anything already recorded.
  const target = mains[1]!;

  const navigation = mockNavigation();
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={navigation as never}
        route={
          {
            key: 'Workout',
            name: 'Workout',
            params: { sessionId, jumpTo: { entryId: target.id, setIndex: 0 } },
          } as never
        }
      />
    </StoreProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));

  // The jumped-to set really was logged as completed.
  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    const log0 = s.entries.find((e) => e.id === target.id)!.setLogs.find((l) => l.setIndex === 0);
    expect(log0?.status).toBe('completed');
  }, WAIT_OPTS);

  // Its own rest page shows — no bounce back to Summary.
  await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
  expect(navigation.replace).not.toHaveBeenCalledWith('Summary', { sessionId });
}, 20000);

/**
 * Reported from the device, in two stages:
 *
 * 1. Complete a set jumped to from Summary, then complete its rest and feedback — the screen
 *    returned to the exact same set instead of progressing at all. Root cause: the landing effect
 *    that applies a `jumpTo` bookmark onto `rewoundTo` treated `rewoundTo` itself as its "have I
 *    already run" flag, skipping only while `rewoundTo` stayed truthy. Completing the bookmarked
 *    set legitimately cleared `rewoundTo` back to null so the workout could resume — but `session`
 *    gets a new object identity on every `reload()`, one of the effect's own dependencies, so that
 *    null re-triggered the effect on the very next reload and re-applied the same bookmark.
 *
 * 2. Once (1) was fixed by clearing `rewoundTo` to null (falling back to the derived front edge),
 *    completing a jumped-ahead set instead snapped back to an *earlier, still-untouched* exercise
 *    — the true front edge — rather than the set's own next page. The expectation is a book: ◂◂/▸▸
 *    and Complete always turn one page from wherever the workout currently is; only an explicit
 *    Summary selection jumps around. The fix computes the *next plan position after the one just
 *    trained* and holds it as the view override (falling back to null only when that next position
 *    already agrees with the newly-recomputed front edge, or there is no next position at all).
 */
it('completing the rest/feedback for a set jumped to from Summary advances to its own next set, not the untouched front edge', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    // Verified for this seed: `active[0]` (the true front edge — §10.8's derived position, not
    // necessarily the first `main` entry) is reps-based, and `active[2]` is a reps-based, 3-set
    // exercise — both can be driven through `complete-set` below, and set 1 of `active[2]` is a
    // genuine "next page" distinct from both `active[2]` set 0 and the front edge.
    rng: createRng(seedFromString('jump-ahead-rest-advance-seed-2')),
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
  const session0 = sessionsRepo.getSession(db, sessionId)!;
  const active = session0.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  // Nothing logged — the front edge is `active[0]` set 0. The bookmark jumps ahead to a later,
  // untouched entry instead, one with more than one set.
  const frontEdge = active[0]!;
  const target = active[2]!;
  expect(target.sets).toBeGreaterThanOrEqual(2);

  const navigation = mockNavigation();
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={navigation as never}
        route={
          {
            key: 'Workout',
            name: 'Workout',
            params: { sessionId, jumpTo: { entryId: target.id, setIndex: 0 } },
          } as never
        }
      />
    </StoreProvider>,
  );

  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));
  await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);

  await fireEvent.press(screen.getByTestId('rest-next'));

  // Turning the page from `target` set 0 lands on `target` set 1 — its own next set — not back on
  // `target` set 0 again (the original bug) and not on the still-untouched `frontEdge` either (the
  // "snaps back to the front edge" regression this test also guards against).
  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));

  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    const targetSetLogs = s.entries.find((e) => e.id === target.id)!.setLogs;
    expect(targetSetLogs.find((l) => l.setIndex === 0)?.status).toBe('completed');
    expect(targetSetLogs.find((l) => l.setIndex === 1)?.status).toBe('completed');
    const frontEdgeLog = s.entries
      .find((e) => e.id === frontEdge.id)!
      .setLogs.find((l) => l.setIndex === 0);
    expect(frontEdgeLog).toBeUndefined();
  }, WAIT_OPTS);
}, 20000);
