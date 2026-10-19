/**
 * Track 39d - Journey's Passport teaser: a card with the three newest stamps (newest first) that
 * opens the Passport book, with the place/country caption and the share button kept. Drives the
 * real store: four completed sessions on four dates, each pinned to a different place.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

jest.setTimeout(60000);
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 15000, interval: 50 };

const PLACES = [
  { date: '2026-01-05', city: 'Lisbon', country: 'Portugal', region: null, countryCode: 'PT' },
  { date: '2026-02-05', city: 'Bend', country: 'United States', region: 'OR', countryCode: 'US' },
  { date: '2026-03-05', city: 'Cusco', country: 'Peru', region: null, countryCode: 'PE' },
  { date: '2026-04-05', city: 'Hanoi', country: 'Vietnam', region: null, countryCode: 'VN' },
];

function Seed({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString());
  usersRepo.updateUser(db, { passportEnabled: true }, nowUtcInstant());
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, nowUtcInstant());
  if (sessionsRepo.getCompletedSessionsForDashboard(db).length === 0) {
    PLACES.forEach((place, n) => {
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library: exerciseLibrary,
        families: familyLibrary,
        request: { focus: 'full', difficulty: 'medium', targetMinutes: 20 },
        clock,
        rng: createRng(seedFromString(`passport-teaser-${n}`)),
        utcInstant,
      });
      const sessionId = sessionsRepo.createPendingSession(db, {
        plan,
        utcInstant,
        localDate: place.date,
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      sessionsRepo.startSession(db, sessionId, utcInstant);
      for (const e of sessionsRepo.getSession(db, sessionId)!.entries) {
        if (e.entryStatus === 'removed_at_approval') continue;
        for (let i = 0; i < e.sets; i += 1) {
          sessionsRepo.logSet(
            db,
            {
              entryId: e.id,
              setIndex: i,
              status: 'completed',
              repsPrescribed: e.repTarget ?? undefined,
              secondsPrescribed: e.durationSec ?? undefined,
              repsActual: e.repTarget ?? undefined,
              secondsActual: e.durationSec ?? undefined,
              restPrescribedSec: e.restSec,
            },
            utcInstant,
          );
        }
      }
      completeSession(
        db,
        { sessionId, library: exerciseLibrary, families: familyLibrary },
        nowUtcInstant(),
      );
      sessionsRepo.applyGeocodeResult(db, sessionId, place, nowUtcInstant());
    });
  }
  return <>{children}</>;
}

describe('Journey - Passport teaser card', () => {
  it('shows only the three newest stamps, newest first, and opens the Passport', async () => {
    render(
      <StoreProvider>
        <Seed>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </Seed>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('passport-section')).toBeTruthy(), WAIT_OPTS);

    const ids = screen.getAllByTestId(/^passport-stamp-/).map((n) => n.props.testID as string);
    expect(ids).toEqual([
      'passport-stamp-Hanoi, VNM',
      'passport-stamp-Cusco, PER',
      'passport-stamp-Bend, OR, USA',
    ]);
    expect(screen.queryByTestId('passport-stamp-Lisbon, PRT')).toBeNull();
    expect(screen.getByText('4 places · 4 countries')).toBeTruthy();
    expect(screen.getByTestId('share-passport')).toBeTruthy();
    expect(screen.queryByTestId('passport-opt-in')).toBeNull();

    expect(screen.getByLabelText('Passport, 4 places in 4 countries. Open passport')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passport-section'));
    await waitFor(() => expect(screen.getByTestId('passport-screen')).toBeTruthy(), WAIT_OPTS);
  });
});
