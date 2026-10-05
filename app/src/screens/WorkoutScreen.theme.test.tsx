/**
 * Active Workout theme toggle (DESIGN.md §8.5): a sun/moon IconButton in the top bar flips the
 * explicit light/dark preference live and persists it, plus the screen rendering real Daybreak
 * values. Runs inside the real ThemeProvider (no mock), unlike the other WorkoutScreen suites.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo, usersRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { ThemeProvider } from '../state/ThemeProvider';
import { daybreak, midnight } from '../theme';
import { inDaybreak } from '../ui/test-utils';
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
  it('flips Midnight -> Daybreak -> Midnight live, relabels, and persists the preference', async () => {
    const { db, sessionId } = await setUpSession();
    render(
      <StoreProvider>
        <ThemeProvider initialPreference="dark">
          <WorkoutScreen navigation={mockNavigation() as never} route={route(sessionId)} />
        </ThemeProvider>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme-toggle')).toBeTruthy(), WAIT_OPTS);

    // Midnight: offers Daybreak.
    expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe('Switch to Daybreak');
    expect(
      StyleSheet.flatten(screen.getByTestId('workout-screen').props.style)?.backgroundColor,
    ).toBe(midnight.bg);

    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-toggle'));
    });
    await waitFor(
      () =>
        expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe(
          'Switch to Midnight',
        ),
      WAIT_OPTS,
    );
    expect(usersRepo.getUser(db)?.themePreference).toBe('light');
    // The whole screen re-rendered in Daybreak, not just the button.
    expect(
      StyleSheet.flatten(screen.getByTestId('workout-screen').props.style)?.backgroundColor,
    ).toBe(daybreak.bg);

    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-toggle'));
    });
    await waitFor(
      () =>
        expect(screen.getByTestId('theme-toggle').props.accessibilityLabel).toBe(
          'Switch to Daybreak',
        ),
      WAIT_OPTS,
    );
    expect(usersRepo.getUser(db)?.themePreference).toBe('dark');
  }, 20000);
});

describe('Workout screen in Daybreak', () => {
  it('paints the paper ground and keeps the rep/pause controls themed', async () => {
    const { sessionId } = await setUpSession();
    render(
      inDaybreak(
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
    ).toBe(daybreak.bg);
    const elapsed = StyleSheet.flatten(screen.getByTestId('workout-elapsed').props.style);
    expect(elapsed.color).toBe(daybreak.text);
  }, 20000);
});
