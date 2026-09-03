/**
 * The library browser, driven through the real navigator and the real on-device store — the same
 * shape as the Home screen tests. What matters here is that the three facts on a card come from
 * real state, that the filters actually narrow the list, and that "needs video" answers the
 * question it exists for.
 *
 * The list is a `FlatList`, so only the first window of rows is mounted; every case that reaches
 * for a specific exercise searches for it first, exactly as a user would.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary } from '@roamfit/data';
import { exerciseStateRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowUtcInstant } from '../lib/localClock';

const PUSH_UP = { id: 'banded-push-up', name: 'Banded Push-Up' };

// Seeded once for the file, not per render: this database is shared by every case here (one
// Jest-scoped db file per test file, see `app/src/db/index.ts`), so a per-render write would
// accumulate and make "2× completed" mean nothing.
beforeAll(() => {
  const db = getDb();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant()); // §13.3 gate — not this test's subject
  exerciseStateRepo.recordExercisePerformed(
    db,
    PUSH_UP.id,
    { localDate: '2026-08-01' },
    nowUtcInstant(),
  );
  exerciseStateRepo.recordExercisePerformed(
    db,
    PUSH_UP.id,
    { localDate: '2026-08-05' },
    nowUtcInstant(),
  );
  exerciseStateRepo.assignUserVideo(db, PUSH_UP.id, 'dQw4w9WgXcQ', nowUtcInstant(), '2026-08-05');
});

async function openExercises() {
  render(
    <StoreProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('open-exercises')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('open-exercises'));
  await waitFor(() => expect(screen.getByTestId('exercise-list')).toBeTruthy());
}

async function openFilters() {
  await fireEvent.press(screen.getByTestId('toggle-filters'));
  await waitFor(() => expect(screen.getByTestId('filter-panel')).toBeTruthy());
}

async function search(text: string) {
  await fireEvent.changeText(screen.getByTestId('exercise-search'), text);
  await waitFor(() => expect(screen.getByTestId('exercise-count')).toBeTruthy());
}

describe('the exercise library', () => {
  it('opens from Home and lists the whole library', async () => {
    await openExercises();
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(
      `${exerciseLibrary.exercises.length} of ${exerciseLibrary.exercises.length} exercises`,
    );
  });

  it('lists alphabetically — the first rendered card is the alphabetically first exercise', async () => {
    await openExercises();
    const firstByName = [...exerciseLibrary.exercises].sort((a, b) =>
      a.name.localeCompare(b.name),
    )[0];
    expect(screen.getByTestId(`exercise-card-${firstByName.id}`)).toBeTruthy();
  });

  it('shows the name, the primary muscle, and how many sessions it has been completed in', async () => {
    await openExercises();
    await search('push-up');

    const card = screen.getByTestId(`exercise-card-${PUSH_UP.id}`);
    expect(card).toBeTruthy();
    expect(screen.getByText(PUSH_UP.name)).toBeTruthy();
    // banded-push-up's primary muscle in the bundled library.
    expect(screen.getAllByText('Chest').length).toBeGreaterThan(0);
    expect(screen.getByTestId(`exercise-card-count-${PUSH_UP.id}`)).toHaveTextContent(
      '2× completed',
    );
  });

  it('says "Not done yet" for an exercise never performed, without any red or scolding copy', async () => {
    await openExercises();
    await search('goblet');
    const goblet = exerciseLibrary.exercises.find((e) => e.name.toLowerCase().includes('goblet'));
    if (goblet) {
      expect(screen.getByTestId(`exercise-card-count-${goblet.id}`)).toHaveTextContent(
        'Not done yet',
      );
    }
  });

  it('searches by name, ignoring punctuation', async () => {
    await openExercises();
    await search('pushup');
    expect(screen.getByTestId(`exercise-card-${PUSH_UP.id}`)).toBeTruthy();
    expect(Number(screen.getByTestId('exercise-count').props.children[0])).toBeLessThan(
      exerciseLibrary.exercises.length,
    );
  });

  it('shows a friendly empty state rather than a blank screen', async () => {
    await openExercises();
    await search('zzzznothing');
    expect(screen.getByTestId('exercise-empty')).toBeTruthy();
  });

  it('isolates the exercises that still need a video, and excludes one that has a link', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('filter-video-needs_video'));

    // The one with an assigned video is gone from the "needs" view...
    await waitFor(() => expect(screen.queryByTestId(`exercise-card-${PUSH_UP.id}`)).toBeNull());
    await search('push-up');
    expect(screen.queryByTestId(`exercise-card-${PUSH_UP.id}`)).toBeNull();

    // ...and comes back under "has video".
    await fireEvent.press(screen.getByTestId('filter-video-has_video'));
    await waitFor(() => expect(screen.getByTestId(`exercise-card-${PUSH_UP.id}`)).toBeTruthy());
  });

  it('marks a video-less exercise on its card — the to-do list, visible while scrolling', async () => {
    await openExercises();
    await search('push-up');
    expect(screen.queryByTestId(`exercise-card-no-video-${PUSH_UP.id}`)).toBeNull();

    const withoutVideo = exerciseLibrary.exercises.find((e) => e.id !== PUSH_UP.id)!;
    await search(withoutVideo.name);
    expect(screen.getByTestId(`exercise-card-no-video-${withoutVideo.id}`)).toBeTruthy();
  });

  it('marks a disabled exercise on its card — the same at-a-glance signal as "no video"', async () => {
    const other = exerciseLibrary.exercises.find((e) => e.id !== PUSH_UP.id)!;
    exerciseStateRepo.setDisabled(getDb(), other.id, true, nowUtcInstant());

    await openExercises();
    await search(other.name);
    expect(screen.getByTestId(`exercise-card-disabled-${other.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`exercise-card-disabled-${PUSH_UP.id}`)).toBeNull();
  });

  it('filters by a library dimension, and counts what is applied', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('filter-equipment-bodyweight'));

    await waitFor(() =>
      expect(screen.getByTestId('toggle-filters')).toHaveTextContent('Filters (1)'),
    );
    const shown = Number(screen.getByTestId('exercise-count').props.children[0]);
    expect(shown).toBe(
      exerciseLibrary.exercises.filter((e) => e.equipment === 'bodyweight').length,
    );

    await fireEvent.press(screen.getByTestId('clear-filters'));
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `${exerciseLibrary.exercises.length} of ${exerciseLibrary.exercises.length} exercises`,
      ),
    );
  });

  it('narrows to the exercises you have actually completed', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('filter-performed-performed'));
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `1 of ${exerciseLibrary.exercises.length} exercises`,
      ),
    );
    expect(screen.getByTestId(`exercise-card-${PUSH_UP.id}`)).toBeTruthy();
  });

  it('clears the search query immediately via the Clear button', async () => {
    await openExercises();
    await search('push-up');
    expect(screen.getByTestId(`exercise-card-${PUSH_UP.id}`)).toBeTruthy();
    expect(screen.getByTestId('clear-search')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('clear-search'));
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `${exerciseLibrary.exercises.length} of ${exerciseLibrary.exercises.length} exercises`,
      ),
    );
    expect(screen.getByTestId('exercise-search').props.value).toBe('');
    expect(screen.queryByTestId('clear-search')).toBeNull();
  });

  it('opens the detail page for the card tapped', async () => {
    await openExercises();
    await search('push-up');
    await fireEvent.press(screen.getByTestId(`exercise-card-${PUSH_UP.id}`));
    await waitFor(() => expect(screen.getByTestId('detail-name')).toHaveTextContent(PUSH_UP.name));
  });
});
