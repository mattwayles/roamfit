/**
 * Journey after a completed session — per the wave brief's testing note ("test the zero-session
 * and just-completed-a-session states, not just the happy middle"). Complements
 * `JourneyScreen.dashboard.test.tsx` (zero-session). Drives the real store (generate -> start ->
 * logSet -> completeSession) directly rather than through the full Workout UI — this test's job
 * is Journey's rendering of the result, not re-proving the workout loop (already covered
 * elsewhere). It then drives the Logbook's day-marker sheet and the Passport opt-in against that
 * same data, and checks Journey reloads on focus.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import {
  completeSession,
  generate,
  manualDayMarkersRepo,
  sessionsRepo,
  usersRepo,
} from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import RootNavigator from '../navigation/RootNavigator';
import { midnight } from '../theme/palettes';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

/** The session `CompleteOneSession` finished (assigned once — the file shares one db). */
let completedSessionId = '';

function CompleteOneSession({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString()); // §13.3 gate — not this test's job
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, nowUtcInstant());

  // Only the first mount of this file's shared db generates the session.
  if (sessionsRepo.getCompletedSessionsForDashboard(db).length === 0) {
    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'hard', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('after-session-test')),
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
    }
    completedSessionId = sessionId;
    completeSession(
      db,
      { sessionId, library: exerciseLibrary, families: familyLibrary },
      nowUtcInstant(),
    );
  }

  return <>{children}</>;
}

async function mountJourney() {
  render(
    <StoreProvider>
      <CompleteOneSession>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </CompleteOneSession>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);
  await fireEvent.press(screen.getByTestId('tab-Journey'));
  await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);
}

describe('Journey after a completed session', () => {
  it('shows lifetime counters, muscle balance, and the calendar logbook once there is data', async () => {
    await mountJourney();

    // Scoped to the counters grid: a muscle-balance bucket can independently land on the same
    // "1" text depending on which exercises the difficulty-eligible pool drew this session, and
    // an unscoped query would then (correctly) fail on ambiguity rather than pin the wrong thing.
    expect(screen.getByTestId('lifetime-counters')).toBeTruthy();
    expect(within(screen.getByTestId('lifetime-sessions')).getByText('1')).toBeTruthy();
    // Every Journey Marker tile wears the primary; icon and label tell them apart.
    for (const id of ['sessions', 'sets', 'levels', 'personal-bests', 'places', 'countries']) {
      const value = screen.getByTestId(`lifetime-${id}-value`);
      expect([id, StyleSheet.flatten(value.props.style).color]).toEqual([id, midnight.teal]);
    }
    expect(screen.getByTestId('muscle-balance')).toBeTruthy();
    expect(screen.getByTestId('calendar-heatmap')).toBeTruthy();

    // The zero-session first-session note and the empty states must be gone now that a session
    // exists.
    expect(screen.queryByTestId('first-session-explanation')).toBeNull();
    expect(screen.queryByTestId('journey-empty')).toBeNull();
    expect(screen.queryByTestId('logbook-empty')).toBeNull();
  });

  it('the Logbook day-marker sheet re-tags a day, and never touches a logged session', async () => {
    await mountJourney();
    const today = nowEngineClock().today;

    await fireEvent.press(screen.getByTestId(`calendar-day-${today}`));
    await waitFor(() => expect(screen.getByTestId('day-marker-sheet')).toBeTruthy(), WAIT_OPTS);
    for (const marker of ['none', 'travel', 'quick', 'full', 'upper', 'abs', 'legs', 'cardio']) {
      expect(screen.getByTestId(`day-marker-option-${marker}`)).toBeTruthy();
    }

    await fireEvent.press(screen.getByTestId('day-marker-option-travel'));
    await waitFor(() => expect(screen.queryByTestId('day-marker-sheet')).toBeNull(), WAIT_OPTS);

    // A display-only override, keyed by local_date (invariant 6) — the real session is intact.
    expect(manualDayMarkersRepo.getManualDayMarkers(testDb()).get(today)).toBe('travel');
    expect(sessionsRepo.getCompletedSessionsForDashboard(testDb()).length).toBeGreaterThan(0);
    expect(screen.getByTestId(`calendar-day-${today}`).props.accessibilityLabel).toBe(
      'Travel day — tap for details',
    );
  });

  it('a trained day opens a sheet with the session card on top and the markers below', async () => {
    await mountJourney();
    const today = nowEngineClock().today;

    await fireEvent.press(screen.getByTestId(`calendar-day-${today}`));
    await waitFor(() => expect(screen.getByTestId('day-marker-sheet')).toBeTruthy(), WAIT_OPTS);
    const card = screen.getByTestId(`day-session-${completedSessionId}`);
    expect(within(card).getByText(/Full body · \d+ min/)).toBeTruthy();
    expect(within(card).getByText(/\d+ exercises? · \d+ sets?/)).toBeTruthy();
    expect(screen.getByText('Mark this day as…')).toBeTruthy();
    expect(screen.getByTestId('day-marker-option-legs')).toBeTruthy();
    expect(screen.queryByTestId('day-hand-logged')).toBeNull();
  });

  it('tapping the session card closes the sheet and opens that workout', async () => {
    await mountJourney();
    const today = nowEngineClock().today;

    await fireEvent.press(screen.getByTestId(`calendar-day-${today}`));
    await waitFor(() => expect(screen.getByTestId('day-marker-sheet')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId(`day-session-${completedSessionId}`));
    await waitFor(
      () => expect(screen.getByTestId('session-history-screen')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.queryByTestId('day-marker-sheet')).toBeNull();
  });

  it('an untrained day shows only the markers; a hand-marked one says it was logged by hand', async () => {
    await mountJourney();
    const today = nowEngineClock().today;
    const [y, m, d] = today.split('-');
    const other = `${y}-${m}-${d === '02' ? '03' : '02'}`;

    await fireEvent.press(screen.getByTestId(`calendar-day-${other}`));
    await waitFor(() => expect(screen.getByTestId('day-marker-sheet')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId(/^day-session-/)).toBeNull();
    expect(screen.queryByTestId('day-hand-logged')).toBeNull();
    expect(screen.getByTestId('day-marker-option-travel')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('day-marker-option-legs'));
    await waitFor(() => expect(screen.queryByTestId('day-marker-sheet')).toBeNull(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId(`calendar-day-${other}`));
    await waitFor(() => expect(screen.getByTestId('day-hand-logged')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId(/^day-session-/)).toBeNull();
  });

  it('Passport: opt-in card first, then a stamp per place once turned on and a place is pinned', async () => {
    await mountJourney();
    await waitFor(() => expect(screen.getByTestId('passport-opt-in')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('passport-opt-in'));
    // Nothing is pinned yet, so turning it on lands on the encouraging "Passport is on" state.
    await waitFor(() => expect(screen.queryByTestId('passport-opt-in')).toBeNull(), WAIT_OPTS);
    expect(screen.getByTestId('passport-empty')).toBeTruthy();
    expect(usersRepo.ensureUser(testDb(), nowUtcInstant()).passportEnabled).toBe(true);

    // The deferred geocode resolves while the user is on another tab...
    sessionsRepo.applyGeocodeResult(
      testDb(),
      completedSessionId,
      { city: 'Bend', country: 'United States', region: 'OR', countryCode: 'US' },
      nowUtcInstant(),
    );
    // ...and Journey reloads on focus, so coming back shows the stamp with no manual refresh.
    await fireEvent.press(screen.getByTestId('tab-Home'));
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('passport-section')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('passport-stamp-Bend, OR, USA')).toBeTruthy();
    expect(screen.getByTestId('share-passport')).toBeTruthy();
    expect(screen.queryByTestId('passport-empty')).toBeNull();
  });
});

/** The file's one shared on-device db, read outside React for assertions. */
function testDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('../db') as typeof import('../db')).getDb();
}
