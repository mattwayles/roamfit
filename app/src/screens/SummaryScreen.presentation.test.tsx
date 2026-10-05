/**
 * §5.8 Debrief and §5.9 Completion presentation, through the real SummaryScreen and store: the
 * additive stat tiles, the 30pt set squares (pine-filled / outlined / dashed) with their feedback
 * dots, the labeled chips in the edit sheet, the Trail Notes card and the sticky footer — and, after
 * FINISH, the Golden Hour celebration: `bg` night base, no violet anywhere on the page. Behavior
 * (jump-to-set, feedback edits, FINISH, the haptic sequence) is covered by SummaryScreen.test.tsx.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import SummaryScreen from './SummaryScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { buildSessionCompletionStats } from '../lib/sessionStats';
import { daylight, vivid, goldenHour } from '../theme';
import { inDaylight } from '../ui/test-utils';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

type Db = ReturnType<typeof useStore>['db'];

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

/** A started session. With `logged`, every set is logged: the first main entry's set 1 completed at
 *  12 reps and (when it has one) set 2 skipped; everything else completed. */
async function seedSession(db: Db, opts: { logged: boolean }) {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('summary-presentation-seed')),
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
  const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const featured = active.find((e) => e.section === 'main' && e.sets >= 2)!;
  if (opts.logged) {
    for (const e of active) {
      for (let i = 0; i < e.sets; i += 1) {
        const skipped = e.id === featured.id && i === 1;
        sessionsRepo.logSet(
          db,
          {
            entryId: e.id,
            setIndex: i,
            status: skipped ? 'skipped' : 'completed',
            repsActual:
              !skipped && e.id === featured.id && i === 0 ? 12 : (e.repTarget ?? undefined),
            secondsActual: e.durationSec ?? undefined,
            restPrescribedSec: e.restSec,
          },
          utcInstant,
        );
      }
    }
    sessionsRepo.recordEntryFeedback(db, featured.id, { difficulty: 'too_hard' }, utcInstant);
  }
  return { sessionId, featuredId: featured.id };
}

async function mount(opts: { logged: boolean; daylight?: boolean }) {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
  const seeded = await seedSession(db, opts);
  const navigation = mockNavigation();
  const tree = (
    <StoreProvider>
      <NavigationContainer>
        <SummaryScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'Summary', params: { sessionId: seeded.sessionId } } as never}
        />
      </NavigationContainer>
    </StoreProvider>
  );
  render(opts.daylight ? inDaylight(tree) : tree);
  await waitFor(() => expect(screen.getByTestId('back-to-workout')).toBeTruthy(), WAIT_OPTS);
  return { db, navigation, ...seeded };
}

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};

describe('§5.8 Debrief presentation', () => {
  it('has a DEBRIEF header, three additive stat tiles, a one-line legend, and the notes card', async () => {
    const { db, sessionId } = await mount({ logged: true });
    const expected = buildSessionCompletionStats(sessionsRepo.getSession(db, sessionId)!);

    expect(screen.getByText('Debrief')).toBeTruthy();
    expect(screen.getByRole('header', { name: /Legs · 30 min/ })).toBeTruthy();
    expect(screen.getByTestId('debrief-stat-sets-value')).toHaveTextContent(
      `${expected.setsCompleted}`,
    );
    expect(screen.getByTestId('debrief-stat-exercises-value')).toHaveTextContent(
      `${expected.exercisesTrained}`,
    );
    expect(screen.getByTestId('debrief-stat-reps-value')).toHaveTextContent(
      expected.totalReps > 0 ? `${expected.totalReps}` : `${expected.totalSeconds}s`,
    );
    // Counts of what happened only — never "of planned" (invariant 4).
    expect(screen.queryByText(/ of \d+/)).toBeNull();

    const legend = within(screen.getByTestId('debrief-legend'));
    expect(legend.getByText('done')).toBeTruthy();
    expect(legend.getByText('skipped')).toBeTruthy();
    expect(legend.getByText('not reached')).toBeTruthy();

    expect(screen.getByText('Trail notes')).toBeTruthy();
    expect(screen.getByTestId('retrospective-input').props.placeholder).toBe(
      'What felt great? Anything to tweak next time?',
    );
    // The sticky footer: FINISH is the one loud button, "Back to workout" is quiet.
    const footer = within(screen.getByTestId('finish-button').parent!.parent!);
    expect(footer.getByTestId('back-to-workout')).toBeTruthy();
  });

  it('draws completed sets pine with the count in ink, skipped as an outline, at 30pt', async () => {
    const { db, sessionId, featuredId } = await mount({ logged: true });
    const entry = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === featuredId)!;
    const done = entry.setLogs.find((l) => l.setIndex === 0)!;
    const skipped = entry.setLogs.find((l) => l.setIndex === 1)!;

    expect(flat(`summary-set-${done.id}`)).toMatchObject({
      width: 30,
      height: 30,
      backgroundColor: goldenHour.pine,
    });
    const count = within(screen.getByTestId(`summary-set-${done.id}`)).getByText('12');
    expect(StyleSheet.flatten(count.props.style).color).toBe(goldenHour.ink);

    expect(flat(`summary-set-${skipped.id}`)).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: goldenHour.text3,
    });
  });

  it('shows one feedback chip per exercise, with a quiet prompt where unanswered; editing opens the sheet', async () => {
    const { db, sessionId, featuredId } = await mount({ logged: true });
    const entries = sessionsRepo.getSession(db, sessionId)!.entries;
    const other = entries.find(
      (e) =>
        e.id !== featuredId &&
        e.entryStatus !== 'removed_at_approval' &&
        e.setLogs.some((l) => l.status === 'completed'),
    )!;

    // The answered exercise carries its answer as a labeled chip; there is no per-set dot.
    expect(screen.getByTestId(`summary-feedback-difficulty-${featuredId}`)).toBeTruthy();
    expect(screen.getByText('Too hard')).toBeTruthy();
    // A performed exercise with no answer offers the prompt chip instead.
    expect(screen.getByTestId(`summary-feedback-placeholder-${other.id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`summary-feedback-difficulty-${featuredId}`));
    await waitFor(() => expect(screen.getByTestId('feedback-edit-sheet')).toBeTruthy(), WAIT_OPTS);
    for (const id of ['too_easy', 'just_right', 'too_hard']) {
      expect(screen.getByTestId(`difficulty-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('difficulty-too_hard')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(screen.getByTestId('feedback-edit-done'));
    await waitFor(() => expect(screen.queryByTestId('feedback-edit-sheet')).toBeNull(), WAIT_OPTS);
  });

  it('mid-workout there is no FINISH or notes card, and "Back to workout" is the primary button', async () => {
    await mount({ logged: false });
    expect(screen.queryByTestId('finish-button')).toBeNull();
    expect(screen.queryByTestId('retrospective-input')).toBeNull();
    expect(screen.getByTestId('back-to-workout')).toBeTruthy();
    // Nothing logged: every square is a dashed "not reached" outline.
    expect(screen.queryByText('Trail notes')).toBeNull();
  });
});

/** Every violet the old completion page (and the design system's `summit`) could have painted. */
const VIOLETS = [
  goldenHour.summit,
  '#7B5CFF',
  '#C084FC',
  '#5b21b6',
  '#7c3aed',
  '#a78bfa',
  '#6d28d9',
  '#e9d5ff',
  '#4c1d95',
  'rgba(142,123,255',
];

describe('§5.9 Completion presentation', () => {
  it('is the Golden Hour re-skin: bg night base, gold stat labels, trail Heck yes, and no violet', async () => {
    await mount({ logged: true });
    await fireEvent.press(screen.getByTestId('finish-button'));
    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);

    expect(flat('session-complete').backgroundColor).toBe(goldenHour.bg);
    expect(screen.getByText('Heck yes! 💪')).toBeTruthy();
    expect(screen.getByTestId('return-home')).toBeTruthy();

    // Stat chips: gold eyebrow labels.
    await waitFor(() => expect(screen.getByTestId('completion-stat-sets-value')).toBeTruthy());
    const label = within(screen.getByTestId('completion-stat-sets')).getByText('Sets');
    expect(StyleSheet.flatten(label.props.style).color).toBe(goldenHour.gold);

    // The cannons have fired by now (the slam beat) — the whole tree, confetti included, has no
    // violet in it anywhere.
    await waitFor(
      () => expect(screen.getByTestId('confetti-burst').children.length).toBeGreaterThan(0),
      { timeout: 8000, interval: 100 },
    );
    const tree = JSON.stringify(screen.toJSON()).toLowerCase();
    expect(tree).toContain(goldenHour.gold.toLowerCase());
    for (const violet of VIOLETS) expect(tree).not.toContain(violet.toLowerCase());
  });
});

describe('Daylight', () => {
  it('debrief: paper ground in the notes input, pine squares with white counts, light keyboard', async () => {
    const { db, sessionId, featuredId } = await mount({ logged: true, daylight: true });
    const entry = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === featuredId)!;
    const done = entry.setLogs.find((l) => l.setIndex === 0)!;
    expect(flat(`summary-set-${done.id}`).backgroundColor).toBe(daylight.pine);
    const count = within(screen.getByTestId(`summary-set-${done.id}`)).getByText('12');
    expect(StyleSheet.flatten(count.props.style).color).toBe(daylight.ink);
    const input = screen.getByTestId('retrospective-input');
    expect(input.props.keyboardAppearance).toBe('light');
    expect(flat('retrospective-input')).toMatchObject({
      color: daylight.text,
      backgroundColor: daylight.surface2,
    });
  });

  it('completion: paper background, brass labels, deep-pine stamped headline over vivid gold', async () => {
    await mount({ logged: true, daylight: true });
    await fireEvent.press(screen.getByTestId('finish-button'));
    await waitFor(() => expect(screen.getByTestId('session-complete')).toBeTruthy(), WAIT_OPTS);
    expect(flat('session-complete').backgroundColor).toBe(daylight.bg);

    await waitFor(() => expect(screen.getByTestId('completion-stat-sets-value')).toBeTruthy());
    const label = within(screen.getByTestId('completion-stat-sets')).getByText('Sets');
    expect(StyleSheet.flatten(label.props.style).color).toBe(daylight.gold);

    const lastShadow = screen.getAllByTestId(/^hype-word-\d+-shadow$/, { hidden: true }).at(-1)!;
    expect(StyleSheet.flatten(lastShadow.props.style).color).toBe(vivid.gold);
    const words = screen.getAllByTestId(/^hype-word-\d+$/);
    expect(StyleSheet.flatten(words.at(-1)!.props.style).color).toBe(daylight.pine);
  });
});
