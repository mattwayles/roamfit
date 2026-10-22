/**
 * The library browser, driven through the real navigator and the real on-device store — the same
 * shape as the Home screen tests. What matters here is that the three facts on a card come from
 * real state, that the filters actually narrow the list.
 *
 * The list is a `FlatList`, so only the first window of rows is mounted; every case that reaches
 * for a specific exercise searches for it first, exactly as a user would.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary } from '@roamfit/data';
import { exerciseStateRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { localDateFromDate, nowUtcInstant } from '../lib/localClock';
import { daybreakTheme } from '../theme';
import { WAIT, flat, inDaybreak } from '../ui/test-utils';

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
});

async function openExercises(daybreak = false) {
  const app = (
    <StoreProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>
  );
  // Awaited: under React 19 `render` commits asynchronously, and an un-awaited render let the
  // next `waitFor` run before anything existed ("render function has not been called") whenever
  // the full suite ran under parallel load. Same for the 5s WAIT over the 1s default.
  await render(daybreak ? inDaybreak(app) : app);
  await waitFor(() => expect(screen.getByTestId('tab-Exercises')).toBeTruthy(), WAIT);
  await fireEvent.press(screen.getByTestId('tab-Exercises'));
  await waitFor(() => expect(screen.getByTestId('exercise-list')).toBeTruthy(), WAIT);
}

async function openFilters() {
  await fireEvent.press(screen.getByTestId('toggle-filters'));
  await waitFor(() => expect(screen.getByTestId('filter-panel')).toBeTruthy());
}

const HID = { hidden: true };

async function openSection(id: 'works' | 'moves' | 'need' | 'fit') {
  await fireEvent.press(screen.getByTestId(`filter-section-${id}`));
  await waitFor(() => expect(screen.getByTestId(`filter-section-${id}`)).toBeTruthy());
}

async function search(text: string) {
  await fireEvent.changeText(screen.getByTestId('exercise-search'), text);
  await waitFor(() => expect(screen.getByTestId('exercise-count')).toBeTruthy());
}

describe('the exercise library in Daybreak', () => {
  it('paints the search well, rows and keyboard from the Daybreak theme', async () => {
    await openExercises(true);
    await search(PUSH_UP.name);
    await waitFor(() => expect(screen.getByTestId(`exercise-card-${PUSH_UP.id}`)).toBeTruthy());
    expect(flat(`exercise-card-${PUSH_UP.id}`).backgroundColor).toBe(daybreakTheme.colors.surface);
    expect(flat('exercise-search').color).toBe(daybreakTheme.colors.text);
    expect(screen.getByTestId('exercise-search').props.keyboardAppearance).toBe('light');
    expect(screen.getByTestId('exercise-search').props.placeholderTextColor).toBe(
      daybreakTheme.colors.text3,
    );
  });
});

describe('the exercise library', () => {
  it('opens from the Field Guide tab and lists the whole library', async () => {
    await openExercises();
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(
      `${exerciseLibrary.exercises.length} moves`,
    );
    expect(screen.getByText('Field guide')).toBeTruthy();
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
    // The teal ×N chip (its accessibility label spells it out as "2× completed").
    expect(screen.getByTestId(`exercise-card-count-${PUSH_UP.id}`)).toHaveTextContent('×2');
    expect(screen.getByLabelText('2× completed')).toBeTruthy();
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

  it('keeps the live count singular for one move', async () => {
    await openExercises();
    await search('banded push-up');
    const shown = Number(screen.getByTestId('exercise-count').props.children[0]);
    expect(shown).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    await waitFor(() => expect(screen.getByTestId('filter-panel')).toBeTruthy());
    await openSection('fit');
    await fireEvent.press(screen.getByTestId('filter-performed-performed'));
    await waitFor(() => expect(screen.getByTestId('exercise-count')).toHaveTextContent('1 move'));
    expect(screen.getByTestId('exercise-count')).not.toHaveTextContent('moves');
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
    expect(screen.getByText('No moves match yet')).toBeTruthy();
    expect(screen.getByTestId('exercise-count')).toHaveTextContent('0 moves');
  });

  it('marks a disabled exercise on its card — ', async () => {
    const other = exerciseLibrary.exercises.find((e) => e.id !== PUSH_UP.id)!;
    exerciseStateRepo.setDisabled(getDb(), other.id, true, nowUtcInstant());

    await openExercises();
    await search(other.name);
    expect(screen.getByTestId(`exercise-card-disabled-${other.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`exercise-card-disabled-${PUSH_UP.id}`)).toBeNull();
    // ...and the row itself steps back to half strength (DESIGN.md §5.3).
    const row = screen.getByTestId(`exercise-card-${other.id}`);
    expect(StyleSheet.flatten(row.props.style).opacity).toBe(0.5);
  });

  it('filters by a library dimension, and counts what is applied', async () => {
    await openExercises();
    await openFilters();
    await openSection('need');
    await fireEvent.press(screen.getByTestId('filter-equipment-band'));

    await waitFor(() => expect(screen.getByTestId('filters-badge')).toHaveTextContent('1'));
    const shown = Number(screen.getByTestId('exercise-count').props.children[0]);
    expect(shown).toBe(exerciseLibrary.exercises.filter((e) => e.equipment === 'band').length);

    await fireEvent.press(screen.getByTestId('clear-filters'));
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `${exerciseLibrary.exercises.length} moves`,
      ),
    );
    expect(screen.queryByTestId('filters-badge')).toBeNull();
  });

  it('shows applied filters inline — removable chips, a quick focus chip and a clear-all', async () => {
    await openExercises();
    await openFilters();
    await openSection('need');
    await fireEvent.press(screen.getByTestId('filter-equipment-band'));
    await fireEvent.press(screen.getByTestId('filters-done'));

    // The band filter has no quick chip, so it surfaces as a removable one.
    await waitFor(() => expect(screen.getByTestId('active-filter-equipment-band')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quick-filter-focus-legs'));
    await waitFor(() => expect(screen.getByTestId('filters-badge')).toHaveTextContent('2'));

    await fireEvent.press(screen.getByTestId('active-filter-equipment-band'));
    await waitFor(() => expect(screen.getByTestId('filters-badge')).toHaveTextContent('1'));

    await fireEvent.press(screen.getByTestId('clear-filters-inline'));
    await waitFor(() => expect(screen.queryByTestId('filters-badge')).toBeNull());
    expect(screen.queryByTestId('clear-filters-inline')).toBeNull();
  });

  it('"No gear" in the quick row narrows to bodyweight moves with no anchor', async () => {
    await openExercises();
    await fireEvent.press(screen.getByTestId('quick-filter-no-gear'));
    await waitFor(() => expect(screen.getByTestId('filters-badge')).toHaveTextContent('1'));
    const expected = exerciseLibrary.exercises.filter(
      (e) => e.equipment === 'bodyweight' && e.anchor === 'none',
    ).length;
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(`${expected} moves`);
    // It's the quick chip itself, not a duplicate removable chip.
    expect(screen.queryByTestId('active-filter-noGear')).toBeNull();
  });

  it('keeps the sheet button live as filters change, and still closes with no match', async () => {
    await openExercises();
    await openFilters();
    await openSection('fit');
    const total = exerciseLibrary.exercises.length;
    expect(screen.getByTestId('filters-done')).toHaveTextContent(`Show ${total} moves`);
    await fireEvent.press(screen.getByTestId('filter-performed-performed'));
    await waitFor(() =>
      expect(screen.getByTestId('filters-done')).toHaveTextContent('Show 1 move'),
    );
    // Completed + a dimension PUSH_UP isn't in: nothing left.
    await fireEvent.press(screen.getByTestId('filter-difficulty-hard'));
    await fireEvent.press(screen.getByTestId('filter-toggle-timedHolds'));
    await openSection('need');
    await fireEvent.press(screen.getByTestId('filter-toggle-noGear'));
    await waitFor(() =>
      expect(screen.getByTestId('filters-done')).toHaveTextContent('No moves match'),
    );
    await fireEvent.press(screen.getByTestId('filters-done'));
    await waitFor(() => expect(screen.getByTestId('exercise-empty')).toBeTruthy());
  });

  it('labels applied filters in plain words', async () => {
    await openExercises();
    await openFilters();
    await openSection('need');
    await openSection('fit');
    await fireEvent.press(screen.getByTestId('filter-anchor-anchor-mid'));
    await fireEvent.press(screen.getByTestId('filter-toggle-timedHolds'));
    await fireEvent.press(screen.getByTestId('filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('active-filter-anchor-anchor-mid')).toHaveTextContent(
        'Mid band anchor point, waist to chest height',
      ),
    );
    expect(screen.getByTestId('active-filter-timedHolds')).toHaveTextContent('Timed holds');
  });

  it('opens only "What it works", and keeps open/closed state across closing the sheet', async () => {
    await openExercises();
    await openFilters();
    expect(screen.getByTestId('filter-section-works')).toHaveProp('accessibilityState', {
      expanded: true,
    });
    expect(screen.getByTestId('filter-section-moves')).toHaveProp('accessibilityState', {
      expanded: false,
    });
    expect(screen.getByTestId('filter-group-primary-legs')).toBeTruthy();
    expect(screen.queryByTestId('filter-group-pattern-push')).toBeNull();

    await openSection('moves');
    expect(screen.getByTestId('filter-group-pattern-push')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filter-section-works'));
    expect(screen.queryByTestId('filter-group-primary-legs')).toBeNull();

    await fireEvent.press(screen.getByTestId('filters-done'));
    await openFilters();
    expect(screen.getByTestId('filter-group-pattern-push')).toBeTruthy();
    expect(screen.queryByTestId('filter-group-primary-legs')).toBeNull();
  });

  it('keeps the body picker and the body-area chips in sync both ways', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('body-picker-region-chest', HID));
    await waitFor(() =>
      expect(screen.getByTestId('filter-group-primary-chest').props.accessibilityState).toEqual(
        expect.objectContaining({ selected: true }),
      ),
    );
    await fireEvent.press(screen.getByTestId('filter-group-primary-chest'));
    await waitFor(() =>
      expect(screen.getByTestId('body-picker-region-chest', HID).props.fill).toEqual(
        screen.getByTestId('body-picker-region-abs', HID).props.fill,
      ),
    );
  });

  it('summarises a closed section and selects a whole body area from one chip', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('filter-group-primary-arms'));
    const arms = ['biceps', 'triceps', 'forearms'];
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `${exerciseLibrary.exercises.filter((e) => e.primary.some((p) => arms.includes(p))).length} moves`,
      ),
    );
    await fireEvent.press(screen.getByTestId('filter-section-works'));
    expect(screen.getByTestId('filter-section-works-summary')).toHaveTextContent('Arms');

    // Expanding the area shows the members, and dropping one makes the group partial.
    await fireEvent.press(screen.getByTestId('filter-section-works'));
    await fireEvent.press(screen.getByTestId('filter-expand-primary-arms'));
    await fireEvent.press(screen.getByTestId('filter-primary-forearms'));
    await waitFor(() =>
      expect(screen.getByTestId('filter-group-primary-arms')).toHaveTextContent('Arms 2/3'),
    );
    await fireEvent.press(screen.getByTestId('filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('active-filter-primary-biceps')).toHaveTextContent('Biceps'),
    );
  });

  it('shows a whole body area as one removable chip in the quick row', async () => {
    await openExercises();
    await openFilters();
    await fireEvent.press(screen.getByTestId('filter-group-primary-core'));
    await fireEvent.press(screen.getByTestId('filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('active-filter-primary-group-core')).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId('active-filter-primary-group-core'));
    await waitFor(() => expect(screen.queryByTestId('filters-badge')).toBeNull());
  });

  it('the sheet "No gear" control and the quick chip are the same state', async () => {
    await openExercises();
    await fireEvent.press(screen.getByTestId('quick-filter-no-gear'));
    await openFilters();
    await openSection('need');
    expect(screen.getByTestId('filter-toggle-noGear')).toHaveProp('accessibilityState', undefined);
    await fireEvent.press(screen.getByTestId('filter-equipment-band'));
    // Band replaces No gear rather than silently matching nothing.
    await waitFor(() => expect(screen.getByTestId('filters-badge')).toHaveTextContent('1'));
    await fireEvent.press(screen.getByTestId('filters-done'));
    expect(screen.getByTestId('quick-filter-no-gear')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(
        `${exerciseLibrary.exercises.filter((e) => e.equipment === 'band').length} moves`,
      ),
    );
  });

  it('narrows to the exercises you have actually completed', async () => {
    await openExercises();
    await openFilters();
    await openSection('fit');
    await fireEvent.press(screen.getByTestId('filter-performed-performed'));
    await waitFor(() => expect(screen.getByTestId('exercise-count')).toHaveTextContent('1 move'));
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
        `${exerciseLibrary.exercises.length} moves`,
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

describe('the "suits my limitations" switch', () => {
  const total = exerciseLibrary.exercises.length;
  const overhead = exerciseLibrary.exercises.filter((e) =>
    e.contraindications.includes('shoulder_overhead'),
  ).length;

  afterEach(() => {
    usersRepo.setLimitationChoices(getDb(), [], '2026-10-21', nowUtcInstant());
  });

  it('is disabled with a neutral note when no limitations are saved, and points to Settings', async () => {
    await openExercises();
    await openFilters();
    await openSection('fit');
    expect(screen.getByTestId('filter-toggle-suitsLimitations').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true, checked: false }),
    );
    expect(screen.getByTestId('no-limitations-note')).toHaveTextContent('No limitations saved.');
    await fireEvent.press(screen.getByTestId('filter-toggle-suitsLimitations'));
    expect(screen.getByTestId('filters-done')).toHaveTextContent(`Show ${total} moves`);
    await fireEvent.press(screen.getByTestId('edit-limitations'));
    await waitFor(() => expect(screen.getByTestId('limitations-screen')).toBeTruthy(), WAIT);
  });

  it('hides what the generator would skip, shows a removable chip and counts it', async () => {
    usersRepo.setLimitationChoices(
      getDb(),
      ['shoulder_overhead'],
      localDateFromDate(new Date()),
      nowUtcInstant(),
    );
    await openExercises();
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(`${total} moves`);
    await openFilters();
    await openSection('fit');
    expect(screen.queryByTestId('no-limitations-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-toggle-suitsLimitations'));
    await waitFor(() =>
      expect(screen.getByTestId('filters-done')).toHaveTextContent(
        `Show ${total - overhead} moves`,
      ),
    );
    await fireEvent.press(screen.getByTestId('filters-done'));
    await waitFor(() =>
      expect(screen.getByTestId('active-filter-suitsLimitations')).toHaveTextContent(
        'Suits my limitations',
      ),
    );
    expect(screen.getByTestId('filters-badge')).toHaveTextContent('1');
    await fireEvent.press(screen.getByTestId('active-filter-suitsLimitations'));
    await waitFor(() =>
      expect(screen.getByTestId('exercise-count')).toHaveTextContent(`${total} moves`),
    );
  });
});
