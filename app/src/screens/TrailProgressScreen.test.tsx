/**
 * The Trail progress page over a session the real completion path wrote, in both themes; plus the
 * two ways in (the Journey Trail card's "Progress ›" and the history page's "Trail ›"). Read-only.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { getNetworkStatus } from '../lib/networkStatus';
import { daylightTheme } from '../theme';
import { inDaylight, WAIT } from '../ui/test-utils';

jest.mock('../lib/networkStatus', () => ({ getNetworkStatus: jest.fn() }));
const mockGetNetworkStatus = getNetworkStatus as jest.MockedFunction<typeof getNetworkStatus>;

let sessionId: string;
let doneFamilyId: string;
let doneEntryId: string;
let doneExerciseId: string;
let emptyFamilyId: string;

beforeAll(() => {
  const db = getDb();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 20 },
    clock,
    rng: createRng(seedFromString('trail-progress')),
    utcInstant,
  });
  sessionId = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, sessionId, utcInstant);
  const live = sessionsRepo
    .getSession(db, sessionId)!
    .entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  for (const entry of live) {
    for (let i = 0; i < entry.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsActual: entry.repTarget != null ? 9 : undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        nowUtcInstant(),
      );
    }
  }
  const withFamily = live.find((e) => e.progressionFamilyId)!;
  doneFamilyId = withFamily.progressionFamilyId!;
  doneEntryId = withFamily.id;
  doneExerciseId = withFamily.exerciseId;
  completeSession(
    db,
    { sessionId, library: exerciseLibrary, families: familyLibrary },
    nowUtcInstant(),
  );
  const used = new Set(live.map((e) => e.progressionFamilyId));
  emptyFamilyId = familyLibrary.families.find((f) => !used.has(f.id))!.id;
});

beforeEach(() => {
  mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
});

async function open(route: { name: string; params?: object }, daylight = false) {
  const app = (
    <StoreProvider>
      <NavigationContainer initialState={{ index: 1, routes: [{ name: 'Tabs' }, route] }}>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>
  );
  await render(daylight ? inDaylight(app) : app);
}

describe('TrailProgressScreen', () => {
  it('shows the family, the current rung, a never-a-loss headline, the chart and its exercises', async () => {
    await open({ name: 'TrailProgress', params: { familyId: doneFamilyId } });
    await waitFor(() => expect(screen.getByTestId('trail-progress-screen')).toBeTruthy(), WAIT);

    const family = familyLibrary.families.find((f) => f.id === doneFamilyId)!;
    expect(screen.getByTestId('trail-name')).toHaveTextContent(family.name);
    expect(screen.getByTestId('trail-current')).toHaveTextContent(/^Now: rung \d+ of \d+/);
    expect(screen.getByTestId('trail-headline')).toHaveTextContent(/One session on this trail/);

    await fireEvent(screen.getByTestId('trail-best-chart-area'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 180 } },
    });
    expect(screen.getByTestId('trail-best-chart-touch')).toBeTruthy();
    expect(screen.getByTestId('trail-rung-card')).toBeTruthy();
    expect(screen.getByTestId(`trail-exercise-${doneExerciseId}`)).toBeTruthy();
  });

  it('opens the exercise page from the exercise list', async () => {
    await open({ name: 'TrailProgress', params: { familyId: doneFamilyId } });
    await waitFor(
      () => expect(screen.getByTestId(`trail-exercise-${doneExerciseId}`)).toBeTruthy(),
      WAIT,
    );
    await fireEvent.press(screen.getByTestId(`trail-exercise-${doneExerciseId}`));
    await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy(), WAIT);
  });

  it('says something neutral for a trail with no history yet', async () => {
    await open({ name: 'TrailProgress', params: { familyId: emptyFamilyId } });
    await waitFor(() => expect(screen.getByTestId('trail-progress-screen')).toBeTruthy(), WAIT);
    expect(screen.getByTestId('trail-headline')).toHaveTextContent(
      'No sessions on this trail yet — this is where your history lands.',
    );
    expect(screen.queryByTestId('trail-best-card')).toBeNull();
  });

  it('shows a quiet missing state for an unknown family id', async () => {
    await open({ name: 'TrailProgress', params: { familyId: 'no_such_family' } });
    await waitFor(() => expect(screen.getByTestId('trail-progress-missing')).toBeTruthy(), WAIT);
  });

  it('is reached from the history page "Trail" link', async () => {
    await open({ name: 'SessionHistory', params: { sessionId } });
    await waitFor(
      () => expect(screen.getByTestId(`history-trail-${doneEntryId}`)).toBeTruthy(),
      WAIT,
    );
    await fireEvent.press(screen.getByTestId(`history-trail-${doneEntryId}`));
    await waitFor(() => expect(screen.getByTestId('trail-progress-screen')).toBeTruthy(), WAIT);
  });

  it('is reached from the Journey Trail card "Progress" button, Adjust untouched', async () => {
    await open({ name: 'Tabs' });
    await waitFor(() => expect(screen.getByTestId('tab-Journey')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(
      () => expect(screen.getByTestId(`board-adjust-${doneFamilyId}`)).toBeTruthy(),
      WAIT,
    );
    await fireEvent.press(screen.getByTestId(`board-trail-progress-${doneFamilyId}`));
    await waitFor(() => expect(screen.getByTestId('trail-progress-screen')).toBeTruthy(), WAIT);
  });
});

describe('TrailProgressScreen in Daylight', () => {
  it('paints the hero on the Daylight surface', async () => {
    await open({ name: 'TrailProgress', params: { familyId: doneFamilyId } }, true);
    await waitFor(() => expect(screen.getByTestId('trail-hero')).toBeTruthy(), WAIT);
    const card = StyleSheet.flatten(screen.getByTestId('trail-hero').props.style);
    expect(card.backgroundColor).toBe(daylightTheme.colors.surface);
    await fireEvent(screen.getByTestId('trail-best-chart-area'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 180 } },
    });
    expect(screen.getByTestId('trail-best-chart-touch')).toBeTruthy();
  });
});
