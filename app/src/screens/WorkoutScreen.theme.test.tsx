/**
 * Active Workout theme toggle (DESIGN.md §8.5): a sun/moon IconButton in the top bar flips the
 * explicit light/dark preference live and persists it, plus the screen rendering real Daylight
 * values. Runs inside the real ThemeProvider (no mock), unlike the other WorkoutScreen suites.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo, usersRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { ThemeProvider } from '../state/ThemeProvider';
import { daylight, goldenHour } from '../theme';
import { inDaylight } from '../ui/test-utils';
import { setUpTimedEntry } from './timedTestHelpers';

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

async function setUpSession(): Promise<{
  db: ReturnType<typeof useStore>['db'];
  sessionId: string;
}> {
  let db!: ReturnType<typeof useStore>['db'];
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
  const { sessionId } = await setUpTimedEntry(db, 'theme-toggle-seed', {
    durationSec: 30,
    unilateral: false,
  });
  return { db, sessionId };
}

const route = (sessionId: string) =>
  ({ key: 'Workout', name: 'Workout', params: { sessionId } }) as never;

describe('Workout theme toggle', () => {
  it('flips Golden Hour -> Daylight -> Golden Hour live, relabels, and persists the preference', async () => {
    const { db, sessionId } = await setUpSession();
    render(
      <StoreProvider>
        <ThemeProvider initialPreference="dark">
          <WorkoutScreen navigation={mockNavigation() as never} route={route(sessionId)} />
        </ThemeProvider>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme-toggle')).toBeTruthy(), WAIT_OPTS);

    // Golden Hour: offers Daylight.
    expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe('Switch to Daylight');
    expect(
      StyleSheet.flatten(screen.getByTestId('workout-screen').props.style)?.backgroundColor,
    ).toBe(goldenHour.bg);

    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-toggle'));
    });
    await waitFor(
      () =>
        expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe(
          'Switch to Golden Hour',
        ),
      WAIT_OPTS,
    );
    expect(usersRepo.getUser(db)?.themePreference).toBe('light');
    // The whole screen re-rendered in Daylight, not just the button.
    expect(
      StyleSheet.flatten(screen.getByTestId('workout-screen').props.style)?.backgroundColor,
    ).toBe(daylight.bg);

    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-toggle'));
    });
    await waitFor(
      () =>
        expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe(
          'Switch to Daylight',
        ),
      WAIT_OPTS,
    );
    expect(usersRepo.getUser(db)?.themePreference).toBe('dark');
  }, 20000);
});

describe('Workout screen in Daylight', () => {
  it('paints the paper ground and keeps the rep/pause controls themed', async () => {
    const { sessionId } = await setUpSession();
    render(
      inDaylight(
        <StoreProvider>
          <ThemeProvider initialPreference="light">
            <WorkoutScreen navigation={mockNavigation() as never} route={route(sessionId)} />
          </ThemeProvider>
        </StoreProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('workout-elapsed')).toBeTruthy(), WAIT_OPTS);
    expect(
      StyleSheet.flatten(screen.getByTestId('workout-screen').props.style)?.backgroundColor,
    ).toBe(daylight.bg);
    const elapsed = StyleSheet.flatten(screen.getByTestId('workout-elapsed').props.style);
    expect(elapsed.color).toBe(daylight.text);
  }, 20000);
});
