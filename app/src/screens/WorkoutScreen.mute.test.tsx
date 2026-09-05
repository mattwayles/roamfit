/**
 * §10.8 — the per-workout mute, and its relationship to the persisted "Timer sounds" setting.
 *
 * Reported from the device: the last-3-seconds beeps were interrupting Spotify, pausing it on
 * every beep and resuming between them. The root cause was the audio session (see
 * `workoutAudio.ts`'s header — the mode was invalid and threw into a best-effort catch, so it was
 * never applied and iOS's non-mixing default stood). The controls here are the other half of that
 * request: a way to turn cue tones off for good, and a way to silence one workout without
 * changing the setting.
 *
 * What the button *does* to the audio module is asserted in `workoutAudio.test.ts`; this covers
 * when it is offered and what it toggles, which is screen behaviour.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

async function startedSession(seed: string): Promise<{ db: Db; sessionId: string }> {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString(seed)),
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
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());
  return { db, sessionId };
}

function renderWorkout(sessionId: string) {
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={mockNavigation() as never}
        route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
      />
    </StoreProvider>,
  );
}

describe('§10.8 muting sounds for one workout', () => {
  it('the button is offered when timer sounds are on, and toggles between mute and unmute', async () => {
    const { db, sessionId } = await startedSession('mute-on-seed');
    expect(usersRepo.ensureUser(db, nowUtcInstant()).cueSoundsEnabled).toBe(true);

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('mute-workout')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByLabelText('Mute sounds for this workout')).toBeTruthy();

    fireEvent.press(screen.getByTestId('mute-workout'));
    await waitFor(
      () => expect(screen.getByLabelText('Unmute sounds for this workout')).toBeTruthy(),
      WAIT_OPTS,
    );

    // Muting one workout is not a settings change — the persisted preference is untouched, which
    // is the whole distinction between this control and the one in Settings.
    expect(usersRepo.ensureUser(db, nowUtcInstant()).cueSoundsEnabled).toBe(true);

    fireEvent.press(screen.getByTestId('mute-workout'));
    await waitFor(
      () => expect(screen.getByLabelText('Mute sounds for this workout')).toBeTruthy(),
      WAIT_OPTS,
    );
  }, 20000);

  it('is still offered when timer sounds are off, because a demo video is not a timer sound', async () => {
    const { db, sessionId } = await startedSession('mute-off-seed');
    usersRepo.updateUser(db, { cueSoundsEnabled: false }, nowUtcInstant());

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('workout-elapsed')).toBeTruthy(), WAIT_OPTS);
    // The Settings toggle governs the cue tones only. The demo player is still audible with it
    // off, so there is always something left for this button to silence.
    expect(screen.getByTestId('mute-workout')).toBeTruthy();
  }, 20000);
});
