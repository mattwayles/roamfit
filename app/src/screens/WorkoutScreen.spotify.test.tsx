/**
 * The Spotify bar's place on the active workout screen. Asked for directly: "a component on the
 * active workout screen to control Spotify so I don't have to swap between apps during a workout."
 *
 * `SpotifyControls` itself is covered in `../components/SpotifyControls.test.tsx`, and what it
 * does to the native module in `../lib/spotifyRemote.test.ts`. What is only provable here is
 * placement: that the bar is on the screen at all, that it is in the *same place* during a set and
 * during a rest (rest being when a user actually reaches for it), and that an unconfigured build
 * loses the row without losing anything else.
 *
 * `../lib/spotifyRemote` is mocked because the real one reports `available: false` under Jest by
 * design — so without a mock the only reachable case would be the one where nothing renders.
 *
 * Setup follows `WorkoutScreen.rest.test.tsx`: entries before the first rep-based `main` entry are
 * logged straight through the store so the screen lands on a reps exercise, avoiding the timed
 * get-ready flow this file isn't about.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { useSpotifyPlayer } from '../lib/spotifyRemote';
import type { SpotifyPlayer } from '../lib/spotifyRemote';

jest.mock('../lib/spotifyRemote', () => ({ useSpotifyPlayer: jest.fn() }));

const mockedHook = useSpotifyPlayer as jest.MockedFunction<typeof useSpotifyPlayer>;

// Same headroom as the sibling screen tests — see `WorkoutScreen.rest.test.tsx`'s header on the
// 250ms display-refresh tick under CPU contention.
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

const actions = {
  connect: jest.fn(),
  togglePlay: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  clearError: jest.fn(),
};

function player(over: Partial<SpotifyPlayer> = {}): SpotifyPlayer {
  return {
    available: true,
    connectionState: 'connected',
    track: { name: 'Bad Habit', artist: 'Steve Lacy' },
    isPlaying: true,
    canSkipNext: true,
    canSkipPrevious: true,
    lastError: null,
    ...actions,
    ...over,
  };
}

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

/** Logs every set of every active entry before `stopBeforeEntryId` straight through the store —
 *  setup, not what is under test. Lifted from `WorkoutScreen.rest.test.tsx`. */
function fastForwardTo(db: Db, session: sessionsRepo.SessionRecord, stopBeforeEntryId: string) {
  for (const entry of session.entries) {
    if (entry.id === stopBeforeEntryId) return;
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i++) {
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
        nowUtcInstant(),
      );
    }
  }
}

/** A started session parked on its first rep-based `main` entry, plus that entry's id. */
async function sessionOnRepsEntry(seed: string): Promise<{ db: Db; sessionId: string }> {
  let db!: Db;
  await render(
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
  const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const firstReps = active.find((e) => e.section === 'main' && e.durationSec == null);
  expect(firstReps).toBeTruthy(); // a 30-min full session always has rep-based main work
  fastForwardTo(db, session, firstReps!.id);

  return { db, sessionId };
}

async function renderWorkout(sessionId: string) {
  await render(
    <StoreProvider>
      <WorkoutScreen
        navigation={mockNavigation() as never}
        route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
      />
    </StoreProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedHook.mockReturnValue(player());
});

describe('Spotify controls on the active workout screen', () => {
  it('puts what is playing on the workout screen, with its transport', async () => {
    const { sessionId } = await sessionOnRepsEntry('spotify-visible-seed');
    await renderWorkout(sessionId);

    await waitFor(() => expect(screen.getByTestId('spotify-controls')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('spotify-track').props.children).toBe('Bad Habit');
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
    // The workout is still the subject of the page.
    expect(screen.getByTestId('exercise-name')).toBeTruthy();
  }, 20000);

  it('stays put across the set/rest transition, so it never has to be looked for', async () => {
    const { sessionId } = await sessionOnRepsEntry('spotify-rest-seed');
    await renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('spotify-controls')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('complete-set'));

    // Rest is the moment a user actually reaches for the music, so this is the case that matters
    // most — and the bar is above the phase view precisely so it doesn't move between the two.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('spotify-controls')).toBeTruthy();
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
  }, 20000);

  it('drives Spotify without touching the workout', async () => {
    const { db, sessionId } = await sessionOnRepsEntry('spotify-press-seed');
    await renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('spotify-next')).toBeTruthy(), WAIT_OPTS);

    const loggedSets = () =>
      sessionsRepo.getSession(db, sessionId)!.entries.flatMap((e) => e.setLogs).length;
    const setsBefore = loggedSets();

    await fireEvent.press(screen.getByTestId('spotify-next'));
    await fireEvent.press(screen.getByTestId('spotify-play-pause'));

    expect(actions.skipNext).toHaveBeenCalledTimes(1);
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    // Skipping a track is not a workout event: no set is logged and the exercise doesn't advance.
    // That is the whole point — this replaces leaving the app, and leaving the app never advanced
    // a set either.
    expect(loggedSets()).toBe(setsBefore);
    expect(screen.getByTestId('complete-set')).toBeTruthy();
  }, 20000);

  it('leaves the workout screen intact when Spotify is not set up in this build', async () => {
    mockedHook.mockReturnValue(player({ available: false, connectionState: 'unavailable' }));
    const { sessionId } = await sessionOnRepsEntry('spotify-absent-seed');
    await renderWorkout(sessionId);

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    // No row, no placeholder, no explanation — and nothing else lost with it.
    expect(screen.queryByTestId('spotify-controls')).toBeNull();
    expect(screen.getByTestId('workout-elapsed')).toBeTruthy();
    expect(screen.getByTestId('mute-workout')).toBeTruthy();
    expect(screen.getByTestId('complete-set')).toBeTruthy();
  }, 20000);
});
