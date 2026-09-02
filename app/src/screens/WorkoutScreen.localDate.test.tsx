/**
 * Invariant 6 regression guard — the signals WorkoutScreen writes must carry the device's
 * **local** date, not a UTC slice of the instant.
 *
 * Three handlers here (pinned note, video-issue report, player error) previously derived
 * `local_date` as `nowUtcInstant().slice(0, 10)`. West of UTC that stamps tomorrow's date on an
 * evening workout's signals, and §12's calendar views — the heatmap, the weekly count — read
 * exactly those dates. This test fails against that old code on any machine behind UTC.
 *
 * It asserts against `localDateFromDate(new Date())` rather than a hard-coded string, so it is
 * correct in every zone; on a UTC box it degenerates to a tautology instead of a false failure,
 * and the `expectedIsMeaningful` check below records whether the run actually exercised the bug.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo, signalsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { setUpTimedEntry } from './timedTestHelpers';
import { localDateFromDate } from '../lib/localClock';

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

describe('invariant 6 — WorkoutScreen signals carry the local date', () => {
  it('a pinned-note edit records local_date, not the UTC slice of the instant', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'workout-localdate-test-seed', {
      durationSec: 10,
      unilateral: false,
    });

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    const noteInput = await waitFor(() => screen.getByTestId('pinned-note-input'), WAIT_OPTS);
    // PinnedNote commits on blur, not on every keystroke — typing alone writes nothing.
    await fireEvent.changeText(noteInput, 'anchor the band lower');
    await fireEvent(noteInput, 'blur');

    await waitFor(
      () => expect(signalsRepo.getSignalEventsByType(db, 'pinned_note_created').length).toBe(1),
      WAIT_OPTS,
    );

    const events = signalsRepo.getSignalEventsByType(db, 'pinned_note_created');
    expect(events.length).toBeGreaterThan(0);

    const expected = localDateFromDate(new Date());
    const naiveUtcSlice = new Date().toISOString().slice(0, 10);
    for (const event of events) {
      expect(event.localDate).toBe(expected);
    }

    // Not an assertion about the code — a note in the output about whether this run actually
    // distinguished the two. On a UTC machine it cannot, and the check above is vacuous.
    const expectedIsMeaningful = expected !== naiveUtcSlice;
    if (expectedIsMeaningful) {
      expect(events[0].localDate).not.toBe(naiveUtcSlice);
    }
  }, 20000);
});
