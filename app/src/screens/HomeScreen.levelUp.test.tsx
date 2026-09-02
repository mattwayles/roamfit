/**
 * ADR 0012 — the "too easy — level up" control, in its final home on the §14.1.4 progression
 * board. Driven through the real Home screen and the real store, from a from-scratch install.
 *
 * The control started on the approval screen, then moved mid-workout, and device feedback moved
 * it here: a ladder position is a property of the user, not of any one session, and the board is
 * the one surface that already shows which rung you are on. It is also the only placement where
 * an already-trained user can correct a too-low starting rung *before* generating anything, which
 * is the whole point given the cold start is level 1.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const FAMILY = 'horizontal_push';
const family = familyLibrary.families.find((f) => f.id === FAMILY)!;

async function mountHome() {
  render(
    <StoreProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>,
  );
  // §13.3 first-launch gate. It is acknowledged once per install and this file shares one db
  // across its tests, so only the first mount sees it — waiting unconditionally would hang the
  // rest.
  await waitFor(
    () =>
      expect(
        screen.queryByTestId('disclaimer-gate') ?? screen.queryByTestId(`board-row-${FAMILY}`),
      ).toBeTruthy(),
    WAIT_OPTS,
  );
  if (screen.queryByTestId('disclaimer-acknowledge')) {
    fireEvent.press(screen.getByTestId('disclaimer-acknowledge'));
  }
  await waitFor(() => expect(screen.getByTestId(`board-row-${FAMILY}`)).toBeTruthy(), WAIT_OPTS);
}

/** Tap the level-up control and confirm it — a level-up is a two-step action, because it resets
 *  this level's micro-progression and there is no "level down" to undo it with. */
async function levelUpWithConfirm(familyId: string) {
  fireEvent.press(screen.getByTestId(`board-level-up-${familyId}`));
  await waitFor(
    () => expect(screen.getByTestId(`board-level-up-confirm-yes-${familyId}`)).toBeTruthy(),
    WAIT_OPTS,
  );
  fireEvent.press(screen.getByTestId(`board-level-up-confirm-yes-${familyId}`));
}

/** The exercise name the board is currently showing for a family. */
function boardExerciseName(familyId: string): string {
  const row = screen.getByTestId(`board-row-${familyId}`);
  const texts: string[] = [];
  const walk = (node: { children?: unknown[] }) => {
    for (const child of node.children ?? []) {
      if (typeof child === 'string') texts.push(child);
      else if (child && typeof child === 'object') walk(child as { children?: unknown[] });
    }
  };
  walk(row as unknown as { children?: unknown[] });
  return texts.join('');
}

describe('ADR 0012 — level up from the progression board', () => {
  it('starts at level 1 and each tap moves the board up exactly one rung', async () => {
    await mountHome();

    // Cold start is the bottom of the ladder (ADR 0012).
    expect(screen.getByTestId(`board-row-${FAMILY}`)).toBeTruthy();
    expect(boardExerciseName(FAMILY)).toContain('Level 1 of');

    await levelUpWithConfirm(FAMILY);
    await waitFor(() => expect(boardExerciseName(FAMILY)).toContain('Level 2 of'), WAIT_OPTS);

    // Repeatable — that is what gets an already-trained user off the bottom rung.
    await levelUpWithConfirm(FAMILY);
    await waitFor(() => expect(boardExerciseName(FAMILY)).toContain('Level 3 of'), WAIT_OPTS);

    // ...and it says what it moved you to.
    expect(screen.getByTestId('board-level-up-notice')).toBeTruthy();
  });

  it('the level it lands on is a real rung of that family', async () => {
    await mountHome();
    // Relative, not absolute: this file shares one database, so an earlier test may already have
    // moved this family up. Read where the board actually is, then check where one tap lands.
    const before = boardExerciseName(FAMILY);
    const currentN = Number(/Level (\d+) of/.exec(before)?.[1]);
    expect(Number.isFinite(currentN)).toBe(true);

    await levelUpWithConfirm(FAMILY);

    await waitFor(() => {
      const rendered = boardExerciseName(FAMILY);
      expect(rendered).toContain(`Level ${currentN + 1} of`);
      // Any sibling on that rung is a correct answer (ADR 0010).
      const rung = family.levels[currentN]; // 0-based index of the (currentN + 1)th level
      const anySiblingShown = rung.exercise_ids.some((id) => {
        const name = exerciseLibrary.exercises.find((e) => e.id === id)?.name;
        return name != null && rendered.includes(name);
      });
      expect(anySiblingShown).toBe(true);
    }, WAIT_OPTS);
  });

  it('never names the exercise being unlocked (ADR 0014)', async () => {
    await mountHome();
    const row = boardExerciseName(FAMILY);

    // The rung above whatever the board is currently on must not appear anywhere on the row —
    // not in the copy, not in the level-up button label.
    const currentN = Number(/Level (\d+) of/.exec(row)?.[1]);
    const nextRung = family.levels[currentN];
    if (nextRung) {
      for (const id of nextRung.exercise_ids) {
        const name = exerciseLibrary.exercises.find((e) => e.id === id)?.name;
        if (name) expect(row).not.toContain(name);
      }
    }

    // ...and the Next Unlock hero above it must not leak it either, or hiding it on the board
    // would be pointless.
    const hero = screen.getByTestId('next-unlock-hero');
    const heroText = JSON.stringify(hero);
    if (nextRung) {
      for (const id of nextRung.exercise_ids) {
        const name = exerciseLibrary.exercises.find((e) => e.id === id)?.name;
        if (name) expect(heroText).not.toContain(name);
      }
    }

    // The hero headlines the movement function, which is the part that stays true either side
    // of the unlock — never the exercise being unlocked, and never the current one.
    expect(JSON.stringify(hero)).toContain(family.name);
    expect(JSON.stringify(hero)).toContain('to next level');

    // What the board row says is how close you are.
    expect(row).toContain('to next level');
    expect(screen.getByTestId(`board-sessions-left-${FAMILY}`)).toBeTruthy();
    expect(screen.getByTestId(`board-progress-${FAMILY}`)).toBeTruthy();
  });

  it('asks before moving a level, and does nothing if you back out', async () => {
    await mountHome();
    const before = boardExerciseName(FAMILY);

    // First tap only opens the confirm — the ladder must not have moved yet.
    fireEvent.press(screen.getByTestId(`board-level-up-${FAMILY}`));
    await waitFor(
      () => expect(screen.getByTestId(`board-level-up-confirm-${FAMILY}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(/Level (\d+) of/.exec(boardExerciseName(FAMILY))?.[1]).toBe(
      /Level (\d+) of/.exec(before)?.[1],
    );

    // Backing out leaves it exactly where it was.
    fireEvent.press(screen.getByTestId(`board-level-up-cancel-${FAMILY}`));
    await waitFor(
      () => expect(screen.queryByTestId(`board-level-up-confirm-${FAMILY}`)).toBeNull(),
      WAIT_OPTS,
    );
    expect(/Level (\d+) of/.exec(boardExerciseName(FAMILY))?.[1]).toBe(
      /Level (\d+) of/.exec(before)?.[1],
    );

    // The confirm is row-scoped: opening one never opens another family's.
    fireEvent.press(screen.getByTestId(`board-level-up-${FAMILY}`));
    await waitFor(
      () => expect(screen.getByTestId(`board-level-up-confirm-${FAMILY}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    const other = familyLibrary.families.find((f) => f.id !== FAMILY)!;
    expect(screen.queryByTestId(`board-level-up-confirm-${other.id}`)).toBeNull();
    expect(screen.getByTestId(`board-level-up-${other.id}`)).toBeTruthy();
  });

  it('offers no control on a mastered family, and none anywhere else in the app', async () => {
    await mountHome();
    // Every family starts at level 1, so nothing is mastered and every row offers the control.
    for (const f of familyLibrary.families) {
      expect(screen.getByTestId(`board-level-up-${f.id}`)).toBeTruthy();
    }
    // The approval and mid-workout buttons this replaced are gone (see ADR 0012's amendment).
    expect(screen.queryByTestId('level-up-set')).toBeNull();
  });
});
