import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrailProgressChart } from './TrailProgressChart';
import type { TrailLevelPage, TrailProgress } from '../lib/trailProgress';
import { inDaybreak, ready } from '../ui/test-utils';

const empty = { points: [], labels: [], pointExercise: [], markers: [] };

// Level 1: band-assisted, two bands. Level 2: strict pull-ups, fewer reps — on its own graph.
const level1: TrailLevelPage = {
  levelId: 'lv_assist',
  n: 1,
  of: 6,
  name: 'Band-assisted pull-up',
  sessions: 2,
  firstDate: '2026-01-04',
  latestDate: '2026-02-01',
  unit: 'reps',
  ladder: {
    points: [
      { localDate: '2026-01-04', value: 4 },
      { localDate: '2026-02-01', value: 5 },
    ],
    labels: ['Rung 1 · B4 × 12 reps · 3 sets', 'Rung 1 · B3 × 8 reps · 3 sets'],
    pointExercise: ['Band-assisted pull-up', 'Band-assisted pull-up'],
    markers: [],
  },
  bests: [{ exerciseId: 'assist', name: 'Band-assisted pull-up', value: 12, band: 'B4' }],
};

const level2: TrailLevelPage = {
  levelId: 'lv_strict',
  n: 2,
  of: 6,
  name: 'Pull-up',
  sessions: 1,
  firstDate: '2026-03-01',
  latestDate: '2026-03-01',
  unit: 'reps',
  ladder: {
    points: [{ localDate: '2026-03-01', value: 0 }],
    labels: ['Rung 2 · 4 reps · 3 sets'],
    pointExercise: ['Pull-up'],
    markers: [],
  },
  bests: [{ exerciseId: 'pullup', name: 'Pull-up', value: 4, band: null }],
};

const progress = (over: Partial<TrailProgress> = {}): TrailProgress => ({
  sessions: 3,
  firstDate: '2026-01-04',
  latestDate: '2026-03-01',
  levels: [level1, level2],
  currentLevel: 1,
  exercises: [],
  ...over,
});

const measure = (id: string) =>
  fireEvent(screen.getByTestId(`${id}-area`), 'layout', {
    nativeEvent: { layout: { width: 320, height: 140 } },
  });

const plot = 'board-chart-plot-vertical_pull';
const title = () => screen.getByTestId('board-level-title-vertical_pull');

describe.each([
  ['Midnight', (n: React.ReactElement) => n],
  ['Daybreak', inDaybreak],
])('TrailProgressChart (%s)', (_name, wrap) => {
  it('opens on the current level, on Progress, and reads a tap as steps up this level', async () => {
    await render(wrap(<TrailProgressChart familyId="vertical_pull" progress={progress()} />));
    await ready('board-chart-vertical_pull');
    expect(title()).toHaveTextContent(/Level 2 · Pull-up/);
    expect(title()).toHaveTextContent(/1 session · Mar 1/);
    expect(screen.getByText('Progress per session')).toBeTruthy();
    expect(screen.getByText(/Steps up this level/)).toBeTruthy();
    expect(screen.queryByText(/Dashed ticks/)).toBeNull();
    expect(screen.getByTestId('board-level-next-vertical_pull')).toBeDisabled();
    await measure(plot);
    await fireEvent.press(screen.getByTestId(`${plot}-touch`), { nativeEvent: { locationX: 900 } });
    expect(screen.getByTestId(`${plot}-readout`)).toHaveTextContent(
      'Mar 1 · Rung 2 · 4 reps · 3 sets · Pull-up',
    );
  });

  it('pages back to the previous level, which keeps its own graph, and forward again', async () => {
    await render(wrap(<TrailProgressChart familyId="vertical_pull" progress={progress()} />));
    await ready('board-chart-vertical_pull');
    await fireEvent.press(screen.getByTestId('board-level-prev-vertical_pull'));
    expect(title()).toHaveTextContent(/Level 1 · Band-assisted pull-up/);
    expect(title()).toHaveTextContent(/2 sessions · Jan 4 – Feb 1/);
    expect(screen.getByTestId('board-level-prev-vertical_pull')).toBeDisabled();
    await measure(plot);
    await fireEvent.press(screen.getByTestId(`${plot}-touch`), { nativeEvent: { locationX: 900 } });
    expect(screen.getByTestId(`${plot}-readout`)).toHaveTextContent(
      'Feb 1 · Rung 1 · B3 × 8 reps · 3 sets · Band-assisted pull-up',
    );
    await fireEvent.press(screen.getByTestId('board-level-next-vertical_pull'));
    expect(title()).toHaveTextContent(/Level 2 · Pull-up/);
  });

  it('Best set is a stat per exercise (top set at the heaviest band), not a graph', async () => {
    await render(
      wrap(
        <TrailProgressChart familyId="vertical_pull" progress={progress({ currentLevel: 0 })} />,
      ),
    );
    await ready('board-chart-vertical_pull');
    await fireEvent.press(screen.getByTestId('board-chart-mode-best-vertical_pull'));
    expect(screen.getAllByText('Best set')).toHaveLength(2); // eyebrow + toggle chip
    expect(screen.queryByTestId(plot)).toBeNull();
    expect(screen.getByTestId('board-best-stat-vertical_pull-assist')).toHaveTextContent(
      '12 reps @ B4',
    );
    // The mode carries across pages; a bodyweight exercise shows no band.
    await fireEvent.press(screen.getByTestId('board-level-next-vertical_pull'));
    expect(screen.getByTestId('board-best-stat-vertical_pull-pullup')).toHaveTextContent('4 reps');
  });

  it('shows no arrows for a trail trained at one level', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({ levels: [level2], currentLevel: 0 })}
        />,
      ),
    );
    await ready('board-chart-vertical_pull');
    expect(title()).toHaveTextContent(/Level 2 · Pull-up/);
    expect(screen.queryByTestId('board-level-prev-vertical_pull')).toBeNull();
    expect(screen.queryByTestId('board-level-next-vertical_pull')).toBeNull();
  });

  it('falls back to Best set, with no toggle, on a level with nothing placeable', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({ levels: [{ ...level2, ladder: empty }], currentLevel: 0 })}
        />,
      ),
    );
    await ready('board-chart-vertical_pull');
    expect(screen.getByText('Best set')).toBeTruthy();
    expect(screen.queryByTestId('board-chart-mode-progress-vertical_pull')).toBeNull();
  });

  it('says so, without an empty chart, on a level with no counted sets', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({ levels: [level1, { ...level2, ladder: empty, bests: [] }] })}
        />,
      ),
    );
    await ready('board-chart-vertical_pull');
    expect(screen.getByTestId('board-level-unmeasured-vertical_pull')).toBeTruthy();
    expect(screen.queryByTestId(plot)).toBeNull();
  });

  it('renders nothing for a trail with no measured sessions', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({ sessions: 0, levels: [], currentLevel: -1 })}
        />,
      ),
    );
    expect(screen.queryByTestId('board-chart-vertical_pull')).toBeNull();
  });
});
