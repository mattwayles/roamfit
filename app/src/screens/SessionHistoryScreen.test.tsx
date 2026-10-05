/**
 * The workout history page, rendered over a session the real completion path wrote (generate, log
 * every set, complete), in both themes. Read-only: it never writes, and a session that isn't
 * `completed` shows the quiet "not in your history" state instead of a half-page.
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
import { daylightTheme, goldenHourTheme } from '../theme';
import { inDaylight, WAIT } from '../ui/test-utils';

jest.mock('../lib/networkStatus', () => ({ getNetworkStatus: jest.fn() }));
const mockGetNetworkStatus = getNetworkStatus as jest.MockedFunction<typeof getNetworkStatus>;

let completedId: string;
let discardedId: string;
let firstEntryId: string;
let firstExerciseId: string;
let skippedEntryId: string;

function makeSession(seed: string): string {
  const db = getDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 20 },
    clock,
    rng: createRng(seedFromString(seed)),
    utcInstant,
  });
  const id = sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
  sessionsRepo.startSession(db, id, utcInstant);
  return id;
}

beforeAll(() => {
  const db = getDb();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());

  completedId = makeSession('history-done');
  const session = sessionsRepo.getSession(db, completedId)!;
  const live = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  live.forEach((entry, idx) => {
    for (let i = 0; i < entry.sets; i += 1) {
      // The very last set of the first entry is skipped, to prove it renders neutrally.
      const skip = idx === 0 && i === entry.sets - 1;
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: skip ? 'skipped' : 'completed',
          repsActual: !skip && entry.repTarget != null ? 9 : undefined,
          secondsActual: !skip ? (entry.durationSec ?? undefined) : undefined,
          restPrescribedSec: entry.restSec,
        },
        nowUtcInstant(),
      );
    }
  });
  firstEntryId = live[0].id;
  skippedEntryId = live[0].id;
  firstExerciseId = live[0].exerciseId;
  completeSession(
    db,
    {
      sessionId: completedId,
      library: exerciseLibrary,
      families: familyLibrary,
      retrospective: 'Legs felt strong',
    },
    nowUtcInstant(),
  );

  discardedId = makeSession('history-discarded');
  sessionsRepo.discardSession(db, discardedId, {}, nowUtcInstant());
});

beforeEach(() => {
  mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
});

async function openHistory(sessionId: string, daylight = false) {
  const app = (
    <StoreProvider>
      <NavigationContainer
        initialState={{
          index: 1,
          routes: [{ name: 'Tabs' }, { name: 'SessionHistory', params: { sessionId } }],
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>
  );
  await render(daylight ? inDaylight(app) : app);
}

describe('SessionHistoryScreen', () => {
  it('shows the date, focus, duration, stats, note and the exercise rows', async () => {
    await openHistory(completedId);
    await waitFor(() => expect(screen.getByTestId('session-history-screen')).toBeTruthy(), WAIT);

    const session = sessionsRepo.getSession(getDb(), completedId)!;
    expect(screen.getByTestId('history-date')).toHaveTextContent(/^\w+, \w+ \d+, \d{4}$/);
    expect(screen.getByTestId('history-focus')).toHaveTextContent(/Full body/);
    expect(screen.getByTestId('history-focus')).toHaveTextContent(
      new RegExp(
        `${Math.max(1, Math.round(session.actualMinutes ?? session.estimatedMinutes))} min`,
      ),
    );
    expect(screen.queryByTestId('history-place')).toBeNull();
    expect(screen.getByTestId('history-stat-sets')).toBeTruthy();
    expect(screen.getByTestId('history-note')).toHaveTextContent('Legs felt strong');
    expect(screen.getByTestId(`history-row-${firstEntryId}`)).toBeTruthy();
  });

  it('shows a skipped set as a neutral note, in no warning colour', async () => {
    await openHistory(completedId);
    await waitFor(
      () => expect(screen.getByTestId(`history-skipped-${skippedEntryId}`)).toBeTruthy(),
      WAIT,
    );
    const note = screen.getByTestId(`history-skipped-${skippedEntryId}`);
    expect(note).toHaveTextContent('1 set skipped');
    const color = StyleSheet.flatten(note.props.style).color;
    expect(color).toBe(goldenHourTheme.colors.text3);
    expect(color).not.toBe(goldenHourTheme.colors.rose);
  });

  it('opens the exercise page from a row', async () => {
    await openHistory(completedId);
    await waitFor(
      () => expect(screen.getByTestId(`history-row-${firstEntryId}`)).toBeTruthy(),
      WAIT,
    );
    await fireEvent.press(screen.getByTestId(`history-row-${firstEntryId}`));
    await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy(), WAIT);
    const exercise = exerciseLibrary.exercises.find((e) => e.id === firstExerciseId)!;
    expect(screen.getByTestId('detail-name')).toHaveTextContent(exercise.name);
  });

  it('says so plainly for a session that was discarded, instead of showing its sets', async () => {
    await openHistory(discardedId);
    await waitFor(() => expect(screen.getByTestId('session-history-missing')).toBeTruthy(), WAIT);
    expect(screen.queryByTestId('session-history-screen')).toBeNull();
  });
});

describe('SessionHistoryScreen in Daylight', () => {
  it('paints the header card on the Daylight surface', async () => {
    await openHistory(completedId, true);
    await waitFor(() => expect(screen.getByTestId('history-header')).toBeTruthy(), WAIT);
    const card = StyleSheet.flatten(screen.getByTestId('history-header').props.style);
    expect(card.backgroundColor).toBe(daylightTheme.colors.surface);
    const skipped = StyleSheet.flatten(
      screen.getByTestId(`history-skipped-${skippedEntryId}`).props.style,
    );
    expect(skipped.color).toBe(daylightTheme.colors.text3);
  });
});
