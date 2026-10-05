import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TrailProgressChart } from './TrailProgressChart';
import type { TrailProgress } from '../lib/trailProgress';
import { inDaybreak, ready } from '../ui/test-utils';

const progress = (over: Partial<TrailProgress> = {}): TrailProgress => ({
  sessions: 3,
  firstDate: '2026-01-04',
  latestDate: '2026-03-01',
  unit: 'reps',
  points: [
    { localDate: '2026-01-04', value: 12, segment: 0 },
    { localDate: '2026-02-01', value: 8, segment: 1 },
    { localDate: '2026-03-01', value: 4, segment: 2 },
  ],
  pointExercise: ['Band-assisted pull-up', 'Band-assisted pull-up', 'Pull-up'],
  pointBand: ['B4', 'B3', null],
  markers: [
    { localDate: '2026-02-01', label: 'B3', kind: 'band' },
    { localDate: '2026-03-01', label: 'L2', kind: 'rung' },
  ],
  legend: [
    { label: 'Band-assisted pull-up · B4', segment: 0 },
    { label: 'Band-assisted pull-up · B3', segment: 1 },
    { label: 'Pull-up', segment: 2 },
  ],
  ladder: {
    points: [
      { localDate: '2026-01-04', value: 4 },
      { localDate: '2026-02-01', value: 5 },
      { localDate: '2026-03-01', value: 19 },
    ],
    labels: [
      'Rung 1 · B4 × 12 reps · 3 sets',
      'Rung 1 · B3 × 8 reps · 3 sets',
      'Rung 2 · 4 reps · 3 sets',
    ],
    pointExercise: ['Band-assisted pull-up', 'Band-assisted pull-up', 'Pull-up'],
    markers: [{ localDate: '2026-03-01', label: 'L2', kind: 'rung' }],
  },
  exercises: [],
  ...over,
});

const measure = (id: string) =>
  fireEvent(screen.getByTestId(`${id}-area`), 'layout', {
    nativeEvent: { layout: { width: 320, height: 140 } },
  });

describe.each([
  ['Midnight', (n: React.ReactElement) => n],
  ['Daybreak', inDaybreak],
])('TrailProgressChart (%s)', (_name, wrap) => {
  it('opens on Progress, with a rung note, and reads a tap as a ladder position', async () => {
    await render(wrap(<TrailProgressChart familyId="vertical_pull" progress={progress()} />));
    await ready('board-chart-vertical_pull');
    expect(screen.getByText('Progress per session')).toBeTruthy();
    expect(screen.getByText(/Dashed ticks mark a move to a new rung\./)).toBeTruthy();
    expect(screen.queryByTestId('board-best-legend-vertical_pull')).toBeNull();
    const plot = 'board-chart-plot-vertical_pull';
    await measure(plot);
    await fireEvent.press(screen.getByTestId(`${plot}-touch`), { nativeEvent: { locationX: 900 } });
    expect(screen.getByTestId(`${plot}-readout`)).toHaveTextContent(
      'Mar 1 · Rung 2 · 4 reps · 3 sets · Pull-up',
    );
  });

  it('toggles to Best set: band-aware legend, band note and an "@ band" readout', async () => {
    await render(wrap(<TrailProgressChart familyId="vertical_pull" progress={progress()} />));
    await ready('board-chart-vertical_pull');
    await fireEvent.press(screen.getByTestId('board-chart-mode-best-vertical_pull'));
    expect(screen.getByText('Best set per session')).toBeTruthy();
    expect(screen.getByText('Dashed ticks mark a move to a new rung or band.')).toBeTruthy();
    expect(screen.getByTestId('board-best-legend-vertical_pull')).toBeTruthy();
    expect(screen.getByText('Band-assisted pull-up · B3')).toBeTruthy();
    const plot = 'board-chart-plot-vertical_pull';
    await measure(plot);
    await fireEvent.press(screen.getByTestId(`${plot}-touch`), { nativeEvent: { locationX: 150 } });
    expect(screen.getByTestId(`${plot}-readout`)).toHaveTextContent(
      'Feb 1 · 8 reps @ B3 · Band-assisted pull-up',
    );
    // And back again.
    await fireEvent.press(screen.getByTestId('board-chart-mode-progress-vertical_pull'));
    expect(screen.getByText('Progress per session')).toBeTruthy();
  });

  it('skips the toggle, legend and tick notes for one bodyweight exercise on one rung', async () => {
    const one = progress({
      points: [{ localDate: '2026-01-04', value: 2, segment: 0 }],
      pointExercise: ['Pull-up'],
      pointBand: [null],
      markers: [],
      legend: [{ label: 'Pull-up', segment: 0 }],
      ladder: {
        points: [{ localDate: '2026-01-04', value: 1 }],
        labels: ['Rung 1 · 2 reps · 3 sets'],
        pointExercise: ['Pull-up'],
        markers: [],
      },
    });
    await render(wrap(<TrailProgressChart familyId="vertical_pull" progress={one} />));
    await ready('board-chart-vertical_pull');
    expect(screen.queryByText(/Dashed ticks/)).toBeNull();
    expect(screen.queryByTestId('board-best-legend-vertical_pull')).toBeNull();
  });

  it('falls back to Best set, with no toggle, when no session could be placed on the ladder', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({
            ladder: { points: [], labels: [], pointExercise: [], markers: [] },
          })}
        />,
      ),
    );
    await ready('board-chart-vertical_pull');
    expect(screen.getByText('Best set per session')).toBeTruthy();
    expect(screen.queryByTestId('board-chart-mode-progress-vertical_pull')).toBeNull();
  });

  it('renders nothing for a trail with no measured sessions', async () => {
    await render(
      wrap(
        <TrailProgressChart
          familyId="vertical_pull"
          progress={progress({
            sessions: 0,
            points: [],
            pointExercise: [],
            pointBand: [],
            markers: [],
            legend: [],
            ladder: { points: [], labels: [], pointExercise: [], markers: [] },
            unit: null,
          })}
        />,
      ),
    );
    expect(screen.queryByTestId('board-chart-vertical_pull')).toBeNull();
  });
});
