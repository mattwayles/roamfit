/**
 * §10.2 Generate, driven through the real screen and the real store.
 *
 * Covers ADR 0013's 90/120-minute chips (which must actually produce a session of about that
 * length, not silently fall back to ~57 minutes) and the grouped anchor checklist that replaced
 * ten crowded chips — including that it is still genuinely multi-select and still persists
 * through `usersRepo`.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { exerciseLibrary, isCardioExercise } from '@roamfit/data';
import { sessionsRepo, usersRepo } from '@roamfit/store';
import { FIXED_POINT_ANCHORS } from '@roamfit/engine';
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
  usersRepo.updateUser(db, { anchorsAvailable: [...FIXED_POINT_ANCHORS] }, now);
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
  it('lays every length out up front, with the current one selected', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    // No drop-down to open (ADR 0013's 90/120 included): every option is on screen from the start.
    for (const minutes of [15, 20, 30, 45, 60, 90, 120]) {
      expect(screen.getByTestId(`time-picker-option-${minutes}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('time-picker-list')).toBeNull();
    // ...and the current choice (the 30-minute default) is marked on its own option.
    expect(screen.getByTestId('time-picker-option-30').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByTestId('time-picker-option-45').props.accessibilityState.selected).toBe(
      false,
    );
    expect(screen.getByTestId('generate-recap').props.children).toBe('30 min · Full body · Medium');
  });

  it('choosing an option sets it, moves the selection and updates the recap', async () => {
    const { navigation, getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('time-picker-option-45'));
    await waitFor(
      () =>
        expect(screen.getByTestId('time-picker-option-45').props.accessibilityState.selected).toBe(
          true,
        ),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('time-picker-option-30').props.accessibilityState.selected).toBe(
      false,
    );
    expect(screen.getByTestId('generate-recap').props.children).toBe('45 min · Full body · Medium');

    fireEvent.press(screen.getByTestId('generate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
    expect(sessionsRepo.getSession(getDb(), sessionId)!.targetMinutes).toBe(45);
  });

  it('each single-choice control has exactly one selected option', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('focus-picker')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('focus-picker-option-legs'));
    await waitFor(
      () =>
        expect(
          screen.getByTestId('focus-picker-option-legs').props.accessibilityState.selected,
        ).toBe(true),
      WAIT_OPTS,
    );
    for (const other of ['upper', 'abs', 'full', 'push', 'pull', 'cardio']) {
      expect(
        screen.getByTestId(`focus-picker-option-${other}`).props.accessibilityState.selected,
      ).toBe(false);
    }

    fireEvent.press(screen.getByTestId('difficulty-picker-option-hard'));
    await waitFor(
      () =>
        expect(
          screen.getByTestId('difficulty-picker-option-hard').props.accessibilityState.selected,
        ).toBe(true),
      WAIT_OPTS,
    );
    expect(
      screen.getByTestId('difficulty-picker-option-medium').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('Focus and Difficulty read as words, not enum values, and Difficulty is a real request', async () => {
    const { navigation, getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('focus-picker')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('difficulty-picker')).toBeTruthy();
    // Every label is legible without opening anything, each focus with its flavor line.
    // Scoped to the picker: the Recommended Focus card above it may repeat a focus name.
    const picker = within(screen.getByTestId('focus-picker'));
    expect(picker.getByText('Full body')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(picker.getByText('Core')).toBeTruthy();
    expect(screen.getByText('Anti-everything core')).toBeTruthy();
    expect(screen.queryByText('abs')).toBeNull();

    fireEvent.press(screen.getByTestId('difficulty-picker-option-easy'));
    await waitFor(
      () =>
        expect(
          screen.getByTestId('difficulty-picker-option-easy').props.accessibilityState.selected,
        ).toBe(true),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('generate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
    expect(sessionsRepo.getSession(getDb(), sessionId)!.difficulty).toBe('easy');
  });

  it('track 14: Cardio is a selectable focus, listed after the muscle-group focuses', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('focus-picker')).toBeTruthy(), WAIT_OPTS);

    // Last in the grid, so the four muscle-group tiles keep their positions.
    expect(screen.getByText('Cardio Only')).toBeTruthy();
    expect(screen.getByText('Heart rate up')).toBeTruthy();
    const order = screen
      .getAllByTestId(/^focus-picker-option-/)
      .map((n) => n.props.testID as string);
    expect(order[order.length - 1]).toBe('focus-picker-option-cardio');

    fireEvent.press(screen.getByTestId('focus-picker-option-cardio'));
    await waitFor(
      () =>
        expect(
          screen.getByTestId('focus-picker-option-cardio').props.accessibilityState.selected,
        ).toBe(true),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('generate-recap').props.children).toContain('Cardio Only');
  });

  it('track 19: the cardio add-on is an off switch that generates cardio between strength work', async () => {
    const { navigation, getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('cardio-addon-toggle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('cardio-addon-toggle').props.accessibilityState.checked).toBe(false);
    expect(screen.getByTestId('cardio-addon-checkbox').props.accessibilityState.checked).toBe(
      false,
    );

    fireEvent.press(screen.getByTestId('cardio-addon-toggle'));
    await waitFor(
      () =>
        expect(screen.getByTestId('cardio-addon-toggle').props.accessibilityState.checked).toBe(
          true,
        ),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('generate-button'));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
    const main = sessionsRepo
      .getSession(getDb(), sessionId)!
      .entries.filter((e) => e.section === 'main');
    const isCardio = main.map((e) =>
      isCardioExercise(exerciseLibrary.exercises.find((x) => x.id === e.exerciseId)!),
    );
    expect(isCardio.some(Boolean)).toBe(true);
    expect(isCardio.some((c) => !c)).toBe(true);
  });

  it('track 19: the cardio add-on is disabled and unticked for Cardio Only, and comes back after', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('cardio-addon-toggle')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('cardio-addon-toggle'));
    await waitFor(
      () =>
        expect(screen.getByTestId('cardio-addon-toggle').props.accessibilityState.checked).toBe(
          true,
        ),
      WAIT_OPTS,
    );

    fireEvent.press(screen.getByTestId('focus-picker-option-cardio'));
    await waitFor(() => {
      const state = screen.getByTestId('cardio-addon-toggle').props.accessibilityState;
      expect(state.disabled).toBe(true);
      expect(state.checked).toBe(false);
    }, WAIT_OPTS);
    expect(screen.getByTestId('cardio-addon-checkbox').props.accessibilityState.checked).toBe(
      false,
    );

    fireEvent.press(screen.getByTestId('focus-picker-option-legs'));
    await waitFor(() => {
      const state = screen.getByTestId('cardio-addon-toggle').props.accessibilityState;
      expect(state.disabled).toBe(false);
      expect(state.checked).toBe(true);
    }, WAIT_OPTS);
  });

  it('the recovery-week option shows an off switch until it is chosen', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('recovery-week-toggle')).toBeTruthy(), WAIT_OPTS);

    const toggle = screen.getByTestId('recovery-week-toggle');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    // The label no longer has to carry the state on its own — the switch does, and it stays constant.
    expect(screen.getByText('Recovery Workout')).toBeTruthy();
    expect(screen.getByTestId('recovery-week-checkbox').props.accessibilityState.checked).toBe(
      false,
    );

    fireEvent.press(toggle);
    await waitFor(() => {
      expect(screen.getByTestId('recovery-week-toggle').props.accessibilityState.checked).toBe(
        true,
      );
      expect(screen.getByTestId('recovery-week-checkbox').props.accessibilityState.checked).toBe(
        true,
      );
    }, WAIT_OPTS);
    expect(screen.getByText('Recovery Workout')).toBeTruthy();
  });

  it.each([90, 120])(
    'a %d minute request produces a session of about that length, not a 60-minute fallback',
    async (minutes) => {
      const { navigation, getDb } = renderScreen();
      await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);
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

    expect(screen.queryByTestId('anchor-anchor-low')).toBeNull();
    fireEvent.press(screen.getByTestId('anchors-disclosure'));

    await waitFor(() => expect(screen.getByTestId('anchor-anchor-low')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('Needs something to anchor to')).toBeTruthy();
    // Plain-language labels, not raw enum values.
    expect(screen.getByText('Low band anchor point')).toBeTruthy();
    expect(screen.queryByText('anchor-low')).toBeNull();
    // Bodyweight/no-fixed-point band exercises are always eligible, so that group is gone.
    expect(screen.queryByText('No fixed point needed')).toBeNull();
    expect(screen.queryByTestId('anchor-none')).toBeNull();
    expect(screen.queryByTestId('anchor-stance')).toBeNull();
  });

  it('exposes low-bar, which the old chip row omitted entirely', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-low-bar')).toBeTruthy(), WAIT_OPTS);
  });

  it('starts with every option checked', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-anchor-low')).toBeTruthy(), WAIT_OPTS);

    for (const value of [
      'anchor-low',
      'anchor-mid',
      'anchor-high',
      'low-bar',
      'pullup-bar',
      'body-support',
    ]) {
      expect(screen.getByTestId(`anchor-${value}`).props.accessibilityState.checked).toBe(true);
    }
    const anchors = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
    expect(anchors.sort()).toEqual(
      ['anchor-low', 'anchor-mid', 'anchor-high', 'low-bar', 'pullup-bar', 'body-support'].sort(),
    );
  });

  it('is still multi-select, and each toggle persists through usersRepo', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-anchor-low')).toBeTruthy(), WAIT_OPTS);

    const before = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
    expect(before).toContain('anchor-low');
    expect(before).toContain('pullup-bar');

    // Turning one off does not turn the others off — this is a checklist, not a radio group.
    fireEvent.press(screen.getByTestId('anchor-anchor-low'));
    await waitFor(() => {
      const after = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
      expect(after).not.toContain('anchor-low');
      expect(after).toContain('anchor-mid');
    }, WAIT_OPTS);

    // ...and turning it back on restores it, keeping everything else selected.
    fireEvent.press(screen.getByTestId('anchor-anchor-low'));
    await waitFor(() => {
      const after = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
      expect(after).toContain('anchor-low');
      expect(after).toContain('anchor-mid');
    }, WAIT_OPTS);
  });

  it('remembers a deselected option across a remount, rather than re-defaulting it on', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-pullup-bar')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('anchor-pullup-bar'));
    await waitFor(() => {
      expect(usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable).not.toContain(
        'pullup-bar',
      );
    }, WAIT_OPTS);

    // Rather than unmount/remount the screen (render()'s returned `unmount` is async in this
    // library version and awkward to sequence here), re-read what a fresh mount would load: the
    // same `usersRepo.ensureUser` call GenerateScreen's own mount effect makes.
    const reloaded = usersRepo.ensureUser(getDb(), '2026-09-01T00:00:00.000Z');
    expect(reloaded.anchorsAvailable).not.toContain('pullup-bar');
  });

  it('track 14: Cardio gear (jump rope) is a second group, unchecked by default', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));

    await waitFor(() => expect(screen.getByTestId('anchor-jump-rope')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('Cardio gear')).toBeTruthy();
    expect(screen.getByText('Jump rope')).toBeTruthy();
    // Unlike every anchor in the first group, jump rope starts unticked — a rope move must never
    // be programmed unless the user opts in, for anyone, new or existing profile alike.
    expect(screen.getByTestId('anchor-jump-rope').props.accessibilityState.checked).toBe(false);
    const anchors = usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable;
    expect(anchors).not.toContain('jump-rope');
  });

  it('track 14: ticking Jump rope persists it, unticking removes it again', async () => {
    const { getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-disclosure')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-jump-rope')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('anchor-jump-rope'));
    await waitFor(() => {
      expect(screen.getByTestId('anchor-jump-rope').props.accessibilityState.checked).toBe(true);
      expect(usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable).toContain(
        'jump-rope',
      );
    }, WAIT_OPTS);
    // The rest of the checklist is untouched by toggling the new group.
    expect(usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable).toContain(
      'anchor-low',
    );

    fireEvent.press(screen.getByTestId('anchor-jump-rope'));
    await waitFor(() => {
      expect(screen.getByTestId('anchor-jump-rope').props.accessibilityState.checked).toBe(false);
      expect(usersRepo.buildUserProfile(getDb(), '2026-09-01').anchorsAvailable).not.toContain(
        'jump-rope',
      );
    }, WAIT_OPTS);
  });

  it('the summary count tracks the selection', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('anchors-summary')).toBeTruthy(), WAIT_OPTS);
    const initial = screen.getByTestId('anchors-summary').props.children.join('');
    fireEvent.press(screen.getByTestId('anchors-disclosure'));
    await waitFor(() => expect(screen.getByTestId('anchor-anchor-mid')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('anchor-anchor-mid'));
    await waitFor(() => {
      const next = screen.getByTestId('anchors-summary').props.children.join('');
      expect(next).not.toBe(initial);
    }, WAIT_OPTS);
  });

  it('track 37j: Push and Pull sit before Cardio and build a split session', async () => {
    const { navigation, getDb } = renderScreen();
    await waitFor(() => expect(screen.getByTestId('focus-picker')).toBeTruthy(), WAIT_OPTS);
    const order = screen
      .getAllByTestId(/^focus-picker-option-/)
      .map((n) => (n.props.testID as string).replace('focus-picker-option-', ''));
    expect(order).toEqual(['upper', 'abs', 'legs', 'full', 'push', 'pull', 'cardio']);
    expect(screen.getByText('Chest, shoulders, triceps')).toBeTruthy();
    expect(screen.getByText('Back, biceps, rear delts')).toBeTruthy();

    fireEvent.press(screen.getByTestId('focus-picker-option-pull'));
    await waitFor(
      () => expect(screen.getByTestId('generate-recap').props.children).toContain('Pull'),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('generate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const { sessionId } = navigation.replace.mock.calls[0][1] as { sessionId: string };
    const session = sessionsRepo.getSession(getDb(), sessionId)!;
    expect(session.focus).toBe('pull');
    const main = session.entries.filter((e) => e.section === 'main').map((e) => e.pattern);
    expect(main).not.toContain('horizontal_push');
    expect(main).not.toContain('vertical_push');
  });
});
