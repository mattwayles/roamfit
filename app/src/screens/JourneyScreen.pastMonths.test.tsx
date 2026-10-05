/**
 * Logbook past months: ‹ › paging, the bounds (earliest mark / current month), the month picker,
 * and opening a past day's workout. Seeds a real completed session today, another two months back,
 * and a hand-set marker four months back (which, with no session there, still bounds ‹).
 */
import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { monthOfLocalDate, shiftMonth } from '../lib/dashboard';
import { WAIT } from '../ui/test-utils';

const currentMonth = monthOfLocalDate(nowEngineClock().today);
const pastMonth = shiftMonth(currentMonth, -2);
const markerMonth = shiftMonth(currentMonth, -4);
const pastDate = `${pastMonth}-10`;
let pastSessionId = '';

function seedCompleted(seed: string, localDate: string): string {
  const db = getDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'medium', targetMinutes: 20 },
    clock,
    rng: createRng(seedFromString(seed)),
    utcInstant,
  });
  const id = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, id, utcInstant);
  for (const entry of sessionsRepo.getSession(db, id)!.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        utcInstant,
      );
    }
  }
  completeSession(
    db,
    { sessionId: id, library: exerciseLibrary, families: familyLibrary },
    utcInstant,
  );
  return id;
}

beforeAll(() => {
  const db = getDb();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
  seedCompleted('past-months-today', nowEngineClock().today);
  pastSessionId = seedCompleted('past-months-past', pastDate);
  manualDayMarkersRepo.setManualDayMarker(db, `${markerMonth}-05`, 'travel', nowUtcInstant());
});

const navRef = createNavigationContainerRef();

async function mountJourney() {
  render(
    <StoreProvider>
      <NavigationContainer ref={navRef}>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT);
  await fireEvent.press(screen.getByTestId('tab-Journey'));
  await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT);
}

const disabled = (id: string) => Boolean(screen.getByTestId(id).props.accessibilityState?.disabled);

describe('Logbook past months', () => {
  it('starts on the current month with › disabled, and pages back to a past session and on to the earliest mark', async () => {
    await mountJourney();
    expect(disabled('logbook-next')).toBe(true);
    expect(disabled('logbook-prev')).toBe(false);

    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await waitFor(() => expect(screen.getByTestId(`calendar-day-${pastDate}`)).toBeTruthy(), WAIT);
    expect(screen.getByTestId(`calendar-day-${pastDate}`).props.accessibilityLabel).toMatch(/Legs/);
    expect(disabled('logbook-next')).toBe(false);

    // Two more months back reaches the hand-set marker's month, the earliest there is.
    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await waitFor(() => expect(disabled('logbook-prev')).toBe(true), WAIT);
    expect(screen.getByTestId(`calendar-day-${markerMonth}-05`)).toBeTruthy();
  });

  it('the month picker shows counts, disables the future, and jumps to a month', async () => {
    await mountJourney();
    await fireEvent.press(screen.getByTestId('logbook-month-label'));
    await waitFor(() => expect(screen.getByTestId('month-picker-sheet')).toBeTruthy(), WAIT);

    expect(screen.getByTestId(`month-option-${currentMonth}`)).toBeTruthy();
    expect(screen.getByTestId(`month-option-${pastMonth}`).props.accessibilityLabel).toMatch(
      /1 workout$/,
    );
    // A month with no workouts is a normal, selectable pill; a future month is not.
    expect(disabled(`month-option-${shiftMonth(pastMonth, -1)}`)).toBe(false);
    const future = shiftMonth(currentMonth, 1);
    if (future.slice(0, 4) === currentMonth.slice(0, 4)) {
      expect(disabled(`month-option-${future}`)).toBe(true);
    }

    await fireEvent.press(screen.getByTestId(`month-option-${pastMonth}`));
    await waitFor(() => expect(screen.queryByTestId('month-picker-sheet')).toBeNull(), WAIT);
    await waitFor(() => expect(screen.getByTestId(`calendar-day-${pastDate}`)).toBeTruthy(), WAIT);
  });

  it("opens a past day's workout from its sheet, and keeps the month when coming back", async () => {
    await mountJourney();
    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await fireEvent.press(screen.getByTestId('logbook-prev'));
    await fireEvent.press(await screen.findByTestId(`calendar-day-${pastDate}`));
    await fireEvent.press(await screen.findByTestId(`day-session-${pastSessionId}`));
    await waitFor(() => expect(screen.getByTestId('session-history-screen')).toBeTruthy(), WAIT);

    // Coming back from the workout lands on the same past month, not the current one.
    act(() => navRef.goBack());
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT);
    expect(screen.getByTestId(`calendar-day-${pastDate}`)).toBeTruthy();
  });
});
