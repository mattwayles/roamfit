/**
 * The exercise detail page, reached the way a user reaches it — through the library list.
 *
 * Load-bearing beyond "it renders": the progression block is computed from real `set_logs`
 * written by the real completion path rather than from a fixture.
 *
 * `render` and `fireEvent` are awaited throughout: this version of RNTL is async, and an
 * un-awaited event simply has not been dispatched yet by the time the next line asserts.
 */
import React from 'react';
import { Linking, StyleSheet } from 'react-native';
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
import { youtubeSearchUrl } from '../lib/youtubeSearch';
import { topoLoops } from '../ui';
import { daybreakTheme, midnightTheme } from '../theme';
import { flat, inDaybreak } from '../ui/test-utils';

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
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 20 },
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

beforeEach(() => {});

async function openDetail(name: string, daybreak = false) {
  const app = (
    <StoreProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>
  );
  await render(daybreak ? inDaybreak(app) : app);
  await waitFor(() => expect(screen.getByTestId('tab-Exercises')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('tab-Exercises'));
  await waitFor(() => expect(screen.getByTestId('exercise-search')).toBeTruthy());
  await fireEvent.changeText(screen.getByTestId('exercise-search'), name);

  const exercise = exerciseLibrary.exercises.find((e) => e.name === name)!;
  await waitFor(() => expect(screen.getByTestId(`exercise-card-${exercise.id}`)).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`exercise-card-${exercise.id}`));
  await waitFor(() => expect(screen.getByTestId('detail-name')).toBeTruthy());
  return exercise;
}

jest.mock('../lib/networkStatus', () => ({ useIsOnline: jest.fn(() => true) }));

describe('the exercise detail page in Daybreak', () => {
  it('paints the hero legend and the spec tiles from the Daybreak palette', async () => {
    await openDetail(PUSH_UP.name, true);
    // Daybreak's hero gradients are deep, so the legend on them is `ink` = white.
    expect(flat('detail-name').color).toBe(daybreakTheme.colors.ink);
    expect(flat('detail-field-Focus').backgroundColor).toBe(daybreakTheme.colors.surface2);
    expect(flat('toggle-exercise-disabled').backgroundColor).toBe(daybreakTheme.colors.surface);
  });
});

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
      'Sections',
      'Progression',
      'Contraindications',
      'Library id',
    ]) {
      expect(screen.getByTestId(`detail-field-${field}`)).toBeTruthy();
    }
  });

  it('names the ladder rung from the stable level id, never a list position', async () => {
    await openDetail(PUSH_UP.name);
    // banded-push-up sits on horizontal_push.l5, the 6th of 11 rungs since track 37k added l3b
    // and l8b — the id stays put while the displayed position follows the ladder.
    expect(screen.getByText('Horizontal Push · level 6 of 11')).toBeTruthy();
  });

  it('opens a YouTube search for "<name> Exercise" from the How to card', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const exercise = await openDetail(PUSH_UP.name);

    await fireEvent.press(screen.getByTestId('how-to-video-link'));

    expect(openURL).toHaveBeenCalledWith(youtubeSearchUrl(exercise.name));
    expect(screen.queryByTestId('demo-media-assign')).toBeNull();
    openURL.mockRestore();
  });

  it('disables an exercise and re-enables it from the same toggle', async () => {
    const exercise = await openDetail(PUSH_UP.name);
    expect(exerciseStateRepo.getExerciseState(getDb(), exercise.id)?.disabledAt ?? null).toBeNull();

    await fireEvent.press(screen.getByTestId('toggle-exercise-disabled'));
    await waitFor(() =>
      expect(exerciseStateRepo.getExerciseState(getDb(), exercise.id)?.disabledAt).not.toBeNull(),
    );

    await fireEvent.press(screen.getByTestId('toggle-exercise-disabled'));
    await waitFor(() =>
      expect(
        exerciseStateRepo.getExerciseState(getDb(), exercise.id)?.disabledAt ?? null,
      ).toBeNull(),
    );
  });

  it('charts the progression and reports the gain for an exercise actually performed', async () => {
    expect(improvedExerciseId).toBeDefined();
    const exercise = exerciseLibrary.exercises.find((e) => e.id === improvedExerciseId)!;
    await openDetail(exercise.name);

    expect(screen.getByTestId('detail-times-completed')).toHaveTextContent(
      new RegExp(`^${improvedSessionCount}sessions? completed$`),
    );
    expect(screen.getByTestId('detail-chart')).toBeTruthy();
    // The line chart draws once measured, over the whole history (no 12-row window).
    await fireEvent(screen.getByTestId('detail-progress-chart-area'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 180 } },
    });
    expect(screen.getByTestId('detail-progress-chart-touch')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('detail-progress-chart-touch'), {
      nativeEvent: { locationX: 1000 },
    });
    expect(screen.getByTestId('detail-progress-chart-readout')).toHaveTextContent(/·/);
    // Progress leads for a laddered exercise (its sessions are placed on the ladder); an exercise
    // off any ladder has no Progress and opens on Best set.
    const laddered = exercise.progression_family != null;
    if (laddered) {
      expect(screen.getByTestId('detail-chart-progress').props.accessibilityState.selected).toBe(
        true,
      );
      expect(screen.getByTestId('detail-chart-best').props.accessibilityState.selected).toBe(false);
      await fireEvent.press(screen.getByTestId('detail-chart-best'));
      expect(screen.getByTestId('detail-chart-best').props.accessibilityState.selected).toBe(true);
    } else {
      expect(screen.queryByTestId('detail-chart-progress')).toBeNull();
      expect(screen.getByTestId('detail-chart-best').props.accessibilityState.selected).toBe(true);
    }
    // Total volume is the same history on a second measure.
    await fireEvent.press(screen.getByTestId('detail-chart-volume'));
    expect(screen.getByTestId('detail-progress-chart')).toBeTruthy();
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

  it('opens on a hero seeded by the exercise id, with the name, subtitle and a back button', async () => {
    const exercise = await openDetail(PUSH_UP.name);

    // The travel-map texture is deterministic from the id: the same exercise always gets the same
    // contour lines. (The tab screens stay mounted underneath, so look through every pattern.)
    const seeded = topoLoops(exercise.id).paths[0];
    for (const pattern of screen.getAllByTestId('topo-pattern')) {
      await fireEvent(pattern, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 200 } },
      });
    }
    expect(screen.getAllByTestId('topo-pattern-loop-0').map((n) => n.props.d)).toContain(seeded);
    expect(screen.getByText(/^Chest · Horizontal push$/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('detail-back'));
    await waitFor(() => expect(screen.queryByTestId('detail-name')).toBeNull());
  });

  it('presents enable/disable as a switch row that reads on when the move is in workouts', async () => {
    const exercise = await openDetail(PUSH_UP.name);
    exerciseStateRepo.setDisabled(getDb(), exercise.id, false, nowUtcInstant());
    await openDetail(PUSH_UP.name);

    const row = screen.getByTestId('toggle-exercise-disabled');
    expect(row.props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Currently appears in workouts')).toBeTruthy();

    // The switch itself toggles the same veto.
    await fireEvent.press(screen.getByTestId('toggle-exercise-disabled-switch'));
    await waitFor(() =>
      expect(screen.getByTestId('toggle-exercise-disabled').props.accessibilityState.checked).toBe(
        false,
      ),
    );
    expect(screen.getByText('Currently hidden from workouts')).toBeTruthy();
    expect(exerciseStateRepo.getExerciseState(getDb(), exercise.id)?.disabledAt).not.toBeNull();

    await fireEvent.press(screen.getByTestId('toggle-exercise-disabled'));
    await waitFor(() =>
      expect(
        exerciseStateRepo.getExerciseState(getDb(), exercise.id)?.disabledAt ?? null,
      ).toBeNull(),
    );
  });

  it('shows the details as a spec grid with the library id last, and gains as chips', async () => {
    const exercise = exerciseLibrary.exercises.find((e) => e.id === improvedExerciseId)!;
    await openDetail(exercise.name);

    expect(screen.getByTestId('detail-field-Equipment')).toBeTruthy();
    expect(screen.getByTestId('detail-field-Library id')).toHaveTextContent(
      new RegExp(exercise.id),
    );

    // An improved dimension is a teal chip with first -> best; the rest are neutral.
    const best = screen.getByTestId('detail-gain-Best set');
    expect(best).toHaveTextContent(/→/);
    expect(StyleSheet.flatten(best.props.style).backgroundColor).toBe(midnightTheme.tints.teal);
  });

  it('greets an exercise with no history with an encouraging empty state, and "Not yet"', async () => {
    const untouched = exerciseLibrary.exercises.find(
      (e) =>
        e.id !== improvedExerciseId &&
        exerciseStateRepo.getExerciseState(getDb(), e.id) === null &&
        exerciseLibrary.exercises.filter((other) => other.name.includes(e.name)).length === 1,
    )!;
    await openDetail(untouched.name);

    expect(screen.getByText('Your progress starts here')).toBeTruthy();
    expect(screen.getByTestId('detail-last-performed')).toHaveTextContent(/^Not yet/);
  });
});
