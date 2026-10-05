import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TrailBestSetChart } from './TrailBestSetChart';
import type { TrailProgress } from '../lib/trailProgress';
import { inDaybreak, ready } from '../ui/test-utils';

const progress = (over: Partial<TrailProgress> = {}): TrailProgress => ({
  sessions: 3,
  firstDate: '2026-01-04',
  latestDate: '2026-03-01',
  unit: 'reps',
  points: [
    { localDate: '2026-01-04', value: 2, segment: 0 },
    { localDate: '2026-02-01', value: 6, segment: 0 },
    { localDate: '2026-03-01', value: 4, segment: 1 },
  ],
  pointExercise: ['Band-assisted pull-up', 'Band-assisted pull-up', 'Pull-up'],
  markers: [{ localDate: '2026-03-01', label: 'L2' }],
  exercises: [
    {
      exerciseId: 'a',
      name: 'Band-assisted pull-up',
      sessions: 2,
      summary: '2 reps → 6 reps',
      segment: 0,
    },
    { exerciseId: 'b', name: 'Pull-up', sessions: 1, summary: '4 reps', segment: 1 },
  ],
  ...over,
});

describe.each([
  ['Midnight', (n: React.ReactElement) => n],
  ['Daybreak', inDaybreak],
])('TrailBestSetChart (%s)', (_name, wrap) => {
  it('draws the best-set chart with a rung-change note and a legend per exercise', async () => {
    await render(wrap(<TrailBestSetChart familyId="vertical_pull" progress={progress()} />));
    await ready('board-best-vertical_pull');
    expect(screen.getByText('Best set per session')).toBeTruthy();
    expect(screen.getByTestId('board-best-chart-vertical_pull-area')).toBeTruthy();
    expect(screen.getByText('Dashed ticks mark a move to a new rung.')).toBeTruthy();
    expect(screen.getByTestId('board-best-legend-vertical_pull')).toBeTruthy();
    expect(screen.getByText('Band-assisted pull-up')).toBeTruthy();
    expect(screen.getByText('Pull-up')).toBeTruthy();
  });

  it('skips the legend and the rung note for one exercise on one rung', async () => {
    const one = progress({
      points: [{ localDate: '2026-01-04', value: 2, segment: 0 }],
      pointExercise: ['Pull-up'],
      markers: [],
      exercises: [{ exerciseId: 'b', name: 'Pull-up', sessions: 1, summary: '2 reps', segment: 0 }],
    });
    await render(wrap(<TrailBestSetChart familyId="vertical_pull" progress={one} />));
    await ready('board-best-vertical_pull');
    expect(screen.queryByTestId('board-best-legend-vertical_pull')).toBeNull();
    expect(screen.queryByText('Dashed ticks mark a move to a new rung.')).toBeNull();
  });

  it('renders nothing for a trail with no measured sessions', async () => {
    await render(
      wrap(
        <TrailBestSetChart
          familyId="vertical_pull"
          progress={progress({
            sessions: 0,
            points: [],
            pointExercise: [],
            markers: [],
            exercises: [],
            unit: null,
          })}
        />,
      ),
    );
    expect(screen.queryByTestId('board-best-vertical_pull')).toBeNull();
  });
});
