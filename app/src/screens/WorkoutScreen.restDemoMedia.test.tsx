/**
 * The rest page now carries the *next* exercise's demo video alongside "Next up" — asked for
 * directly: rest is when a user preps the next anchor or checks their form, not only after.
 *
 * `networkStatus` is mocked online for the same reason `ExerciseDetailScreen.test.tsx` mocks it:
 * `DemoMedia` renders nothing at all offline (ADR 0008 — the "How to" cue is the offline demo).
 *
 * Reuses `WorkoutScreen.rest.test.tsx`'s fast-forward-to-a-reps-entry setup rather than duplicating
 * it, since the interesting behaviour here is what's on the rest page, not how rest starts.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { getNetworkStatus } from '../lib/networkStatus';

jest.mock('../lib/networkStatus', () => ({ getNetworkStatus: jest.fn() }));
const mockGetNetworkStatus = getNetworkStatus as jest.MockedFunction<typeof getNetworkStatus>;

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

function fastForwardTo(
  db: ReturnType<typeof useStore>['db'],
  session: sessionsRepo.SessionRecord,
  stopBeforeEntryId: string,
) {
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

describe('Rest page demo media', () => {
  beforeEach(() => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
  });

  it('shows the next exercise’s video, already expanded, without a tap', async () => {
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
      rng: createRng(seedFromString('rest-demo-media-test-seed')),
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
    const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    // A reps entry with at least one more active entry after it, so there's a genuine "next" to
    // show a video for.
    const firstRepsEntry = activeEntries.find(
      (e, i) =>
        e.section === 'main' &&
        e.durationSec == null &&
        activeEntries.slice(i + 1).some((later) => later.entryStatus !== 'removed_at_approval'),
    );
    expect(firstRepsEntry).toBeTruthy();

    fastForwardTo(db, session, firstRepsEntry!.id);

    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // Rest auto-started, and the next exercise's demo block is already there — no "Demo" tap
    // needed, since rest is exactly the moment to look.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    await waitFor(
      () => expect(screen.getByTestId('rest-demo-media-block')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('demo-media-body')).toBeTruthy();
    expect(screen.getByTestId('demo-media-search-link')).toBeTruthy();
  });
});
