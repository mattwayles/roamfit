/**
 * The exercise detail page, reached the way a user reaches it — through the library list.
 *
 * Two things here are load-bearing beyond "it renders": a video pasted on this page lands in the
 * same `exercise_state.user_video_id` the workout screen reads (so one video serves both places,
 * with no new column), and the progression block is computed from real `set_logs` written by the
 * real completion path rather than from a fixture.
 *
 * `networkStatus` is mocked online because `DemoMedia` renders nothing at all when offline (ADR
 * 0008 — the "How to" cue is the offline demo), and the paste field lives inside it.
 *
 * `render` and `fireEvent` are awaited throughout: this version of RNTL is async, and an
 * un-awaited event simply has not been dispatched yet by the time the next line asserts.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import {
  completeSession,
  exerciseStateRepo,
  generate,
  sessionsRepo,
  usersRepo,
} from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { getNetworkStatus } from '../lib/networkStatus';

jest.mock('../lib/networkStatus', () => ({ getNetworkStatus: jest.fn() }));
const mockGetNetworkStatus = getNetworkStatus as jest.MockedFunction<typeof getNetworkStatus>;

const PUSH_UP = { id: 'banded-push-up', name: 'Banded Push-Up' };

/** Runs one real session end to end — generate, log every set, complete — so the detail page has
 *  genuine history to read. Returns the rep-metric exercises that actually ran. */
function runOneSession(seed: string, reps: number): string[] {
  const db = getDb();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, nowUtcInstant());

  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'normal', targetMinutes: 20 },
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
  sessionsRepo.startSession(db, sessionId, utcInstant);
  const session = sessionsRepo.getSession(db, sessionId)!;
  const repExercises: string[] = [];
  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    if (entry.repTarget != null) repExercises.push(entry.exerciseId);
    for (let i = 0; i < entry.sets; i += 1) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsActual: entry.repTarget != null ? reps : undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
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
  return repExercises;
}

/** An exercise that ran in two sessions, the second at higher reps than the first — i.e. one with
 *  a real, earned gain. Which exercises repeat is up to the engine's variety rules, so this runs
 *  sessions at increasing reps until one does. */
let improvedExerciseId: string;
let improvedSessionCount: number;

beforeAll(() => {
  usersRepo.acknowledgeDisclaimer(getDb(), nowUtcInstant());
  const seen = new Map<string, number>();
  for (let i = 0; i < 8 && improvedExerciseId === undefined; i += 1) {
    for (const id of runOneSession(`detail-${i}`, 6 + i * 2)) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
      if ((seen.get(id) ?? 0) >= 2) {
        improvedExerciseId = id;
        improvedSessionCount = seen.get(id) as number;
        break;
      }
    }
  }
});

beforeEach(() => {
  mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
});

async function openDetail(name: string) {
  await render(
    <StoreProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('open-exercises')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('open-exercises'));
  await waitFor(() => expect(screen.getByTestId('exercise-search')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('exercise-search'), name);

  const exercise = exerciseLibrary.exercises.find((e) => e.name === name)!;
  await waitFor(() => expect(screen.getByTestId(`exercise-card-${exercise.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`exercise-card-${exercise.id}`));
  await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy());
  return exercise;
}

describe('the exercise detail page', () => {
  it('shows the how-to cue and every field on the record', async () => {
    const exercise = await openDetail(PUSH_UP.name);

    expect(screen.getByTestId('detail-name')).toHaveTextContent(exercise.name);
    expect(screen.getByTestId('detail-setup')).toHaveTextContent(exercise.setup);

    for (const field of [
      'Focus',
      'Movement pattern',
      'Primary muscles',
      'Secondary muscles',
      'Equipment',
      'Band range',
      'Anchor',
      'Anchor class',
      'Sides',
      'Metric',
      'Difficulty',
      'Tier',
      'Role',
      'Progression',
      'Contraindications',
      'Library id',
    ]) {
      expect(screen.getByTestId(`detail-field-${field}`)).toBeTruthy();
    }
  });

  it('names the ladder rung from the stable level id, never a list position', async () => {
    await openDetail(PUSH_UP.name);
    // banded-push-up sits on horizontal_push.l5 in the bundled ladders.
    expect(screen.getByText('Horizontal Push · level 5 of 9')).toBeTruthy();
  });

  it('offers the same demo controls the workout screen does', async () => {
    await openDetail(PUSH_UP.name);
    await waitFor(() => expect(screen.getByTestId('demo-media-assign')).toBeTruthy());
  });

  it('assigns a video into the column the workout screen reads', async () => {
    const exercise = await openDetail(PUSH_UP.name);
    exerciseStateRepo.clearUserVideo(getDb(), exercise.id, nowUtcInstant());

    await waitFor(() => expect(screen.getByTestId('demo-media-url-input')).toBeTruthy());
    await fireEvent.changeText(
      screen.getByTestId('demo-media-url-input'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    await fireEvent.press(screen.getByTestId('demo-media-url-save'));

    // Not screen-local state: the same store read `WorkoutScreen` makes for its own player.
    await waitFor(() =>
      expect(exerciseStateRepo.getUserVideoId(getDb(), exercise.id)).toBe('dQw4w9WgXcQ'),
    );
  });

  it('removes that video again from the same place', async () => {
    const exercise = await openDetail(PUSH_UP.name);
    exerciseStateRepo.assignUserVideo(
      getDb(),
      exercise.id,
      'dQw4w9WgXcQ',
      nowUtcInstant(),
      '2026-09-01',
    );

    // Re-enter so the screen re-reads the assignment it is about to clear.
    await openDetail(PUSH_UP.name);
    await waitFor(() => expect(screen.getByTestId('demo-media-url-clear')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('demo-media-url-clear'));

    await waitFor(() => expect(exerciseStateRepo.getUserVideoId(getDb(), exercise.id)).toBeNull());
  });

  it('charts the progression and reports the gain for an exercise actually performed', async () => {
    expect(improvedExerciseId).toBeDefined();
    const exercise = exerciseLibrary.exercises.find((e) => e.id === improvedExerciseId)!;
    await openDetail(exercise.name);

    expect(screen.getByTestId('detail-times-completed')).toHaveTextContent(
      new RegExp(`^${improvedSessionCount}sessions? completed$`),
    );
    expect(screen.getByTestId('detail-chart')).toBeTruthy();
    expect(screen.getByTestId('detail-progress-summary')).toHaveTextContent(
      /Stronger than your first session/,
    );
    expect(screen.getByTestId('detail-gain-Best set')).toBeTruthy();
  });

  it('says something neutral for an exercise never performed — no chart, no scolding', async () => {
    const untouched = exerciseLibrary.exercises.find(
      (e) =>
        e.id !== improvedExerciseId &&
        exerciseStateRepo.getExerciseState(getDb(), e.id) === null &&
        // A name unique enough that searching for it lands on exactly this card.
        exerciseLibrary.exercises.filter((other) => other.name.includes(e.name)).length === 1,
    )!;
    await openDetail(untouched.name);

    expect(screen.getByTestId('detail-times-completed')).toHaveTextContent(/^0sessions completed$/);
    expect(screen.queryByTestId('detail-chart')).toBeNull();
    expect(screen.getByTestId('detail-progress-summary')).toHaveTextContent(
      'No sessions logged yet — this is where your history lands.',
    );
  });
});
