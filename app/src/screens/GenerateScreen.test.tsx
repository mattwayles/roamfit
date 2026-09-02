/**
 * §10.2 Generate, driven through the real screen and the real store.
 *
 * Covers ADR 0013's 90/120-minute chips (which must actually produce a session of about that
 * length, not silently fall back to ~57 minutes) and the grouped anchor checklist that replaced
 * ten crowded chips — including that it is still genuinely multi-select and still persists
 * through `usersRepo`.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo, usersRepo } from '@roamfit/store';
import { DEFAULT_ANCHORS_AVAILABLE } from '@roamfit/engine';
import GenerateScreen from './GenerateScreen';
import { StoreProvider, useStore } from '../state/StoreContext';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const now = new Date().toISOString();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, now);
  // `getDb()` is a module-level singleton shared by every test in this file, and these tests
  // deliberately mutate the user's sticky anchors (§5.3). Reset to the default so each test
  // starts from the same state instead of inheriting the previous one's toggles.
  usersRepo.updateUser(db, { anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE] }, now);
  onReady(db);
  return null;
}

/** Mounts the screen with a db-grabbing sibling, so each test mounts exactly ONE tree. Two
 *  `render()` calls in a single test leave both mounted and their effects then fight over
 *  `screen`, which shows up as unrelated tests timing out. */
function renderScreen() {
  const navigation = mockNavigation();
  let db!: ReturnType<typeof useStore>['db'];
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
      <GenerateScreen
        navigation={navigation as never}
        route={{ key: 'Generate', name: 'Generate', params: undefined } as never}
      />
    </StoreProvider>,
  );
  return { navigation, getDb: () => db };
}

describe('§10.2 Generate screen', () => {
  it('is closed by default, showing only the current value', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    // The list is not rendered until the field is opened — that is the point of a drop-down.
    expect(screen.queryByTestId('time-picker-list')).toBeNull();
    expect(screen.queryByTestId('time-picker-option-90')).toBeNull();
    // ...but the current choice is legible without opening anything.
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByTestId('time-picker').props.accessibilityState.expanded).toBe(false);
  });

  it('opening the field lists every length, 90 and 120 included', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('time-picker'));

    await waitFor(() => expect(screen.getByTestId('time-picker-list')).toBeTruthy(), WAIT_OPTS);
    for (const minutes of [15, 20, 30, 45, 60, 90, 120]) {
      expect(screen.getByTestId(`time-picker-option-${minutes}`)).toBeTruthy();
    }
    expect(screen.getByTestId('time-picker').props.accessibilityState.expanded).toBe(true);
  });

  it('choosing an option sets it and closes the list', async () => {
    const { navigation, getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('time-picker'));
    await waitFor(
      () => expect(screen.getByTestId('time-picker-option-45')).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('time-picker-option-45'));

    await waitFor(() => expect(screen.queryByTestId('time-picker-list')).toBeNull(), WAIT_OPTS);
    expect(screen.getByText('45 min')).toBeTruthy();

    fireEvent.press(screen.getByTestId('generate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
    expect(sessionsRepo.getSession(getDb(), sessionId)!.targetMinutes).toBe(45);
  });

  it('only one drop-down is open at a time', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('time-picker'));
    await waitFor(() => expect(screen.getByTestId('time-picker-list')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('focus-picker'));
    await waitFor(() => expect(screen.getByTestId('focus-picker-list')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('time-picker-list')).toBeNull();
  });

  it('Focus and Effort are drop-downs too, with human labels rather than enum values', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('focus-picker')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('effort-picker')).toBeTruthy();
    // Closed, the fields already read as words.
    expect(screen.getByText('Full body')).toBeTruthy();
    expect(screen.getByText('Normal')).toBeTruthy();

    fireEvent.press(screen.getByTestId('focus-picker'));
    await waitFor(
      () => expect(screen.getByTestId('focus-picker-option-abs')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getByText('Core')).toBeTruthy();
    expect(screen.queryByText('abs')).toBeNull();
  });

  it('the recovery-week option shows an unticked checkbox until it is chosen', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('recovery-week-toggle')).toBeTruthy(), WAIT_OPTS);

    const toggle = screen.getByTestId('recovery-week-toggle');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    // The label no longer has to carry the state on its own — it stays constant either way.
    expect(screen.getByText('Recovery Workout')).toBeTruthy();
    expect(screen.getByTestId('recovery-week-checkbox').props.children).toBe('');

    fireEvent.press(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('recovery-week-toggle').props.accessibilityState.checked).toBe(
        true,
      );
      expect(screen.getByTestId('recovery-week-checkbox').props.children).toBe('\u2713');
    }, WAIT_OPTS);
    expect(screen.getByText('Recovery Workout')).toBeTruthy();
  });

  it.each([90, 120])(
    'a %d minute request produces a session of about that length, not a 60-minute fallback',
    async (minutes) => {
      const { navigation, getDb } = renderScreen();
      await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);
      fireEvent.press(screen.getByTestId('time-picker'));
      await waitFor(
        () => expect(screen.getByTestId(`time-picker-option-${minutes}`)).toBeTruthy(),
        WAIT_OPTS,
      );
      fireEvent.press(screen.getByTestId(`time-picker-option-${minutes}`));
      // Re-query after the state update: `handleGenerate` closes over `minutes`, so pressing a
      // button element captured before the option press would run the stale closure.
      await waitFor(() => expect(screen.getByTestId('generate-button')).toBeTruthy(), WAIT_OPTS);
      fireEvent.press(screen.getByTestId('generate-button'));

      await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
      const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
      const session = sessionsRepo.getSession(getDb(), sessionId)!;

      expect(session.targetMinutes).toBe(minutes);
      // ADR 0013: within the §5.6 ±10% band, and specifically not the old ~57-minute fallback.
      expect(Math.abs(session.estimatedMinutes - minutes) / minutes).toBeLessThanOrEqual(0.1);
      expect(session.timeBudgetDeviation).toBeNull();
    },
  );

  it('anchors start collapsed and expand to a grouped checklist', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);

    expect(screen.queryByTestId('anchor-stance')).toBeNull();
    fireEvent.press(screen.getByTestId('anchors-disclosure'));

    await waitFor(() => expect(screen.getByTestId('anchor-stance')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('No fixed point needed')).toBeTruthy();
    expect(screen.getByText('Needs something to anchor to')).toBeTruthy();
    // Plain-language labels, not raw enum values.
    expect(screen.getByText('Band looped around a thigh')).toBeTruthy();
    expect(screen.queryByText('thigh-loop')).toBeNull();
  });

  it('exposes low-bar, which the old chip row omitted entirely', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-low-bar')).toBeTruthy(), WAIT_OPTS);
  });

  it('is still multi-select, and each toggle persists through usersRepo', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-stance')).toBeTruthy(), WAIT_OPTS);

    const before = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
    expect(before).toContain('stance');
    expect(before).not.toContain('pullup-bar');

    // Turning one off does not turn the others off — this is a checklist, not a radio group.
    fireEvent.press(screen.getByTestId('anchor-stance'));
    await waitFor(() => {
      const after = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
      expect(after).not.toContain('stance');
      expect(after).toContain('feet');
    }, WAIT_OPTS);

    // ...and turning a new one on keeps everything already selected.
    fireEvent.press(screen.getByTestId('anchor-pullup-bar'));
    await waitFor(() => {
      const after = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
      expect(after).toContain('pullup-bar');
      expect(after).toContain('feet');
    }, WAIT_OPTS);
  });

  it('the summary count tracks the selection', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-summary')).toBeTruthy(), WAIT_OPTS);
    const initial = screen.getByTestId('anchors-summary').props.children.join('');
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-feet')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchor-feet'));
    await waitFor(() => {
      const next = screen.getByTestId('anchors-summary').props.children.join('');
      expect(next).not.toBe(initial);
    }, WAIT_OPTS);
  });
});
