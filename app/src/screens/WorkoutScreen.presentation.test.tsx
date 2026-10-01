/**
 * The Golden Hour presentation layer of the active workout (docs/DESIGN.md §5.7), driven through
 * the real WorkoutScreen: the session progress bar, the coach toast + rest line (seeded, so the
 * same set always gets the same words), the rest page's pips, the paused dim, and the timed ring.
 * Behavior — logging, timers, rest resume — is covered by the sibling `WorkoutScreen.*.test.tsx`
 * files; this one only proves the reward loop is wired.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { goldenHour } from '../theme';
import { exerciseComplete, lastSet, pick, rest, setComplete } from '../lib/hypeCopy';
import { fastForwardTo, setUpTimedEntry } from './timedTestHelpers';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

type Db = ReturnType<typeof useStore>['db'];

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

function renderWorkout(sessionId: string) {
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={mockNavigation() as never}
        route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
      />
    </StoreProvider>,
  );
}

/** A started session parked on its first rep-based main entry. */
async function sessionOnFirstRepsEntry(db: Db, seed: string) {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
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
  const session = sessionsRepo.getSession(db, sessionId)!;
  const entries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const target = entries.find((e) => e.section === 'main' && e.durationSec == null)!;
  fastForwardTo(db, session, target.id);
  return { sessionId, target, entryCount: entries.length, entries };
}

describe('Workout presentation (§5.7)', () => {
  it('draws one progress segment per exercise, and a completed set earns a seeded coach line, a rest line and a popped pip', async () => {
    const db = await freshDb();
    const { sessionId, target, entryCount, entries } = await sessionOnFirstRepsEntry(
      db,
      'presentation-seed',
    );
    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);

    // Top bar + session progress: one segment per active entry.
    expect(screen.getByTestId('workout-home')).toBeTruthy();
    expect(screen.getByTestId('pause-workout')).toBeTruthy();
    expect(screen.getByTestId('abandon-button')).toBeTruthy();
    for (let i = 0; i < entryCount; i++) {
      expect(screen.getByTestId(`segmented-bar-segment-${i}`)).toBeTruthy();
    }
    expect(screen.queryByTestId(`segmented-bar-segment-${entryCount}`)).toBeNull();
    // Reps hero: the labeled primary, and the labeled Undo / Swap / Skip row.
    expect(screen.getByText('COMPLETE SET')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByText('Swap')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();

    fireEvent.press(screen.getByTestId('complete-set'));

    // Rest page: lagoon hero, the rest-pool line seeded by (entry, set), pips for the set just done.
    await waitFor(() => expect(screen.getByTestId('rest-hero')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('rest-line')).toHaveTextContent(pick(rest, `${target.id}:0`));
    expect(screen.getByTestId('rest-pips')).toBeTruthy();
    // The pip for the set just done lands filled (in the main-section color) a beat after the page
    // opens, so it pops rather than simply being there.
    await waitFor(
      () =>
        expect(
          StyleSheet.flatten(screen.getByTestId('rest-pips-0-dot').props.style).backgroundColor,
        ).toBe(goldenHour.ember),
      WAIT_OPTS,
    );

    // The coach line comes from the pool the set's position calls for, picked by seed.
    const toast = screen.getByTestId('toast');
    const positionIndex = entries.findIndex((e) => e.id === target.id);
    expect(positionIndex).toBeGreaterThanOrEqual(0);
    const lastSetComesNext =
      entries.length > 0 &&
      target.sets === 1 &&
      entries[entries.length - 1]!.id !== target.id &&
      entries.slice(positionIndex + 1).reduce((n, e) => n + e.sets, 0) === 1;
    const pool = lastSetComesNext ? lastSet : target.sets === 1 ? exerciseComplete : setComplete;
    expect(toast).toHaveTextContent(pick(pool, `${target.id}:0`));

    // ...and the progress bar filled that exercise's segment by its completed sets.
    const fill = StyleSheet.flatten(
      screen.getByTestId(`segmented-bar-fill-${positionIndex}`).props.style,
    );
    expect(fill.width).toBe(`${(1 / target.sets) * 100}%`);
  }, 30000);

  it('pausing dims the hero to 55% and shows a PAUSED chip; resuming restores both', async () => {
    const db = await freshDb();
    const { sessionId } = await setUpTimedEntry(db, 'presentation-pause-seed', {
      durationSec: 30,
      unilateral: false,
    });
    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('paused-chip')).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByTestId('hero-card').props.style)?.opacity,
    ).toBeUndefined();

    fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(() => expect(screen.getByTestId('paused-chip')).toBeTruthy(), WAIT_OPTS);
    expect(StyleSheet.flatten(screen.getByTestId('hero-card').props.style)?.opacity).toBe(0.55);

    fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(() => expect(screen.queryByTestId('paused-chip')).toBeNull(), WAIT_OPTS);
    expect(
      StyleSheet.flatten(screen.getByTestId('hero-card').props.style)?.opacity,
    ).toBeUndefined();
  }, 30000);

  it('the timed ring starts empty with the duration flanked by minus / plus, then fills as the hold runs', async () => {
    const db = await freshDb();
    const { sessionId } = await setUpTimedEntry(db, 'presentation-ring-seed', {
      durationSec: 30,
      unilateral: false,
    });
    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);

    expect(screen.getByTestId('timed-ring').props.accessibilityValue.now).toBe(0);
    expect(screen.getByTestId('duration-minus')).toBeTruthy();
    expect(screen.getByTestId('duration-plus')).toBeTruthy();
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('30');

    fireEvent.press(screen.getByTestId('timed-circle'));
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Tap to pause'),
      { timeout: 8000, interval: 50 },
    );
    expect(screen.queryByTestId('duration-minus')).toBeNull();
    await waitFor(
      () =>
        expect(screen.getByTestId('timed-ring').props.accessibilityValue.now).toBeGreaterThan(0),
      { timeout: 8000, interval: 50 },
    );
  }, 30000);
});
