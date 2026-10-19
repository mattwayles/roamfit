/**
 * User-reported: on a rest page, pressing the "Progress" button (which `replace`s WorkoutScreen
 * with Summary) and then pressing Back lost the rest timer entirely and landed on the exercise
 * page instead — because `phase`/`restingEntryId`/`restingSetIndex` were plain component state,
 * discarded the moment the screen unmounted. Migration 0021 persists them on the session row
 * (`resting_entry_id`/`resting_set_index`/`resting_started_at`), and WorkoutScreen now restores
 * them on mount (see `restingRestoredRef` in WorkoutScreen.tsx).
 *
 * Standing up the real "Progress -> Summary -> Back" round trip needs a real navigation stack,
 * which these tests mock; a `replace`-then-`replace`-back is exercised here as what it actually
 * does to WorkoutScreen — unmount it, then mount a fresh instance for the same session — since
 * that unmount/remount is the only thing that matters to the bug (the mocked navigation calls
 * themselves are inert either way).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  DEFAULT_BAND_SETTINGS,
  FIXED_POINT_ANCHORS,
  createRng,
  seedFromString,
} from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
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
  // The seeded plan this test was written against assumes every fixed point is available (the
  // pre-37b default); a new user now owns nothing, which changes the plan's first exercise.
  usersRepo.updateUser(db, { anchorsAvailable: [...FIXED_POINT_ANCHORS] }, nowUtcInstant());
  // A new user owns no bands; this suite is about band prescriptions.
  usersRepo.updateUser(db, { bandSettings: DEFAULT_BAND_SETTINGS }, new Date().toISOString());
  onReady(db);
  return null;
}

describe('Rest page survives the "Progress" button round trip', () => {
  it('re-mounting WorkoutScreen after leaving mid-rest lands back on the rest page, not the next exercise', async () => {
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 45 },
      clock,
      rng: createRng(seedFromString('rest-resume-test-seed')),
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

    const firstRender = await render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);

    // Persisted immediately on entering rest — this is what a real "Progress" tap would still
    // have on the row even though the in-memory `phase` state is about to be thrown away.
    const restingSession = sessionsRepo.getSession(db, sessionId)!;
    expect(restingSession.restingEntryId).not.toBeNull();
    expect(restingSession.restingStartedAt).not.toBeNull();

    // The "Progress" button replaces this screen (unmounting it) with Summary; going Back
    // replaces Summary with a fresh Workout mount. Only the unmount/remount matters here.
    firstRender.unmount();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    // Lands directly on the rest page — no press needed — instead of the next exercise's page.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('complete-set')).toBeNull();
  }, 20000);
});
