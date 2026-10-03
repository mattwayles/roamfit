/**
 * A new Passport stamp on the completion screen, through the real SummaryScreen and store. The
 * Passport lookup itself (`lib/newStamp.ts`) is mocked here and covered in newStamp.test.ts; what
 * this proves is the screen: the stamp only exists when Passport is on and the lookup found a new
 * place, it slams in with the stamping haptics, tapping it stamps again, and "Heck yes!" is held
 * for it but never for a lookup that found nothing.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { lookupNewStamp, type NewStamp } from '../lib/newStamp';

jest.mock('../lib/newStamp', () => ({
  ...jest.requireActual('../lib/newStamp'),
  lookupNewStamp: jest.fn(),
}));
const lookup = lookupNewStamp as jest.Mock;

jest.setTimeout(30000);
const EVENTUALLY = { timeout: 12000, interval: 50 };

const BEND: NewStamp = {
  label: 'Bend, OR, USA',
  dateLabel: 'OCT 3, 2026',
  placeCount: 4,
  countryCount: 2,
  newCountry: true,
};

type Db = ReturnType<typeof useStore>['db'];

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

async function finishASession(passportEnabled: boolean) {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), EVENTUALLY);
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  usersRepo.ensureUser(db, utcInstant);
  usersRepo.updateUser(db, { passportEnabled }, utcInstant);
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('summary-new-stamp-seed')),
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
  for (const e of sessionsRepo.getSession(db, sessionId)!.entries) {
    if (e.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < e.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: e.id,
          setIndex: i,
          status: 'completed',
          repsActual: e.repTarget ?? undefined,
          secondsActual: e.durationSec ?? undefined,
          restPrescribedSec: e.restSec,
        },
        utcInstant,
      );
    }
  }
  render(
    <StoreProvider>
      <NavigationContainer>
        <SummaryScreen
          navigation={
            {
              navigate: jest.fn(),
              replace: jest.fn(),
              reset: jest.fn(),
              goBack: jest.fn(),
              setOptions: jest.fn(),
            } as never
          }
          route={{ key: 'Summary', name: 'Summary', params: { sessionId } } as never}
        />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('finish-button')).toBeTruthy(), EVENTUALLY);
  fireEvent.press(screen.getByTestId('finish-button'));
  await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), EVENTUALLY);
  return { db, sessionId };
}

describe('new Passport stamp on the completion screen', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => lookup.mockReset());

  it('slams the stamp in with the stamping haptics, then lets "Heck yes!" arrive after it', async () => {
    lookup.mockResolvedValue(BEND);
    const impact = jest.spyOn(Haptics, 'impactAsync');
    const notify = jest.spyOn(Haptics, 'notificationAsync');
    const { sessionId } = await finishASession(true);

    expect(lookup).toHaveBeenCalledWith(expect.anything(), sessionId);
    await waitFor(() => expect(screen.getByTestId('new-stamp')).toBeTruthy(), EVENTUALLY);
    expect(screen.getByText('YOU EARNED A NEW STAMP!')).toBeTruthy();
    expect(screen.getByLabelText('Bend, OR, USA, OCT 3, 2026')).toBeTruthy();
    expect(screen.getByText('Stamp #4 · 2 countries')).toBeTruthy();
    expect(screen.getByTestId('new-stamp-new-country')).toBeTruthy();

    // Contact: a sharp rigid hit, then the heavy weight behind it (the headline's own slam is the
    // first Heavy, so the stamp's is the second).
    await waitFor(
      () => expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid),
      EVENTUALLY,
    );
    await waitFor(
      () =>
        expect(
          impact.mock.calls.filter(([s]) => s === Haptics.ImpactFeedbackStyle.Heavy).length,
        ).toBeGreaterThan(1),
      EVENTUALLY,
    );
    // The fanfare, the stamp's payoff, then the button's own beat.
    await waitFor(() => expect(notify.mock.calls.length).toBeGreaterThanOrEqual(3), EVENTUALLY);
  });

  it('tapping the stamp stamps it again', async () => {
    lookup.mockResolvedValue(BEND);
    const impact = jest.spyOn(Haptics, 'impactAsync');
    await finishASession(true);
    await waitFor(
      () => expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid),
      EVENTUALLY,
    );
    const rigid = () =>
      impact.mock.calls.filter(([s]) => s === Haptics.ImpactFeedbackStyle.Rigid).length;
    const before = rigid();
    fireEvent.press(screen.getByTestId('new-stamp-press'));
    await waitFor(() => expect(rigid()).toBe(before + 1), EVENTUALLY);
  });

  it('never looks anything up when Passport is off', async () => {
    await finishASession(false);
    await waitFor(() => expect(screen.getByTestId('return-home')).toBeTruthy(), EVENTUALLY);
    expect(lookup).not.toHaveBeenCalled();
    expect(screen.queryByTestId('new-stamp')).toBeNull();
  });

  it('shows no stamp, and still releases the button, when the lookup finds nothing new', async () => {
    lookup.mockResolvedValue(null);
    const notify = jest.spyOn(Haptics, 'notificationAsync');
    await finishASession(true);
    // The fanfare, then the button's own beat — with no stamp payoff in between to wait for.
    await waitFor(() => expect(notify.mock.calls.length).toBeGreaterThanOrEqual(2), EVENTUALLY);
    expect(screen.queryByTestId('new-stamp')).toBeNull();
  });
});
