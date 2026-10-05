import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProgressChart } from './ProgressChart';
import { inDaylight, ready } from '../ui/test-utils';

const POINTS = [
  { localDate: '2026-01-04', value: 2 },
  { localDate: '2026-02-10', value: 8 },
  { localDate: '2026-10-01', value: 12 },
];

const chart = (extra: object = {}) => (
  <ProgressChart
    title="Best set"
    points={POINTS}
    formatValue={(v) => `${v} reps`}
    integerTicks
    {...extra}
  />
);

const measure = () =>
  fireEvent(screen.getByTestId('progress-chart-area'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 180 } },
  });

describe.each([
  ['Golden Hour', (n: React.ReactElement) => n],
  ['Daylight', inDaylight],
])('ProgressChart (%s)', (_name, wrap) => {
  it('summarises the series for assistive tech, first to last', async () => {
    await render(wrap(chart()));
    await ready('progress-chart-area');
    expect(screen.getByLabelText('Best set: 2 reps on Jan 4 to 12 reps on Oct 1')).toBeTruthy();
  });

  it('draws nothing until it is measured, then takes a tap on the nearest point', async () => {
    await render(wrap(chart()));
    await ready('progress-chart-area');
    expect(screen.queryByTestId('progress-chart-touch')).toBeNull();
    await measure();
    await fireEvent.press(screen.getByTestId('progress-chart-touch'), {
      nativeEvent: { locationX: 1 },
    });
    expect(screen.getByTestId('progress-chart-readout')).toHaveTextContent('Jan 4 · 2 reps');
    await fireEvent.press(screen.getByTestId('progress-chart-touch'), {
      nativeEvent: { locationX: 900 },
    });
    expect(screen.getByTestId('progress-chart-readout')).toHaveTextContent('Oct 1 · 12 reps');
  });

  it('renders markers, segments and the optional point note without error', async () => {
    await render(
      wrap(
        chart({
          markers: [{ localDate: '2026-02-10', label: 'L4' }],
          points: POINTS.map((p, i) => ({ ...p, segment: i === 2 ? 1 : 0 })),
          describePoint: (i: number) => (i === 2 ? 'Push-up' : null),
        }),
      ),
    );
    await ready('progress-chart-area');
    await measure();
    await fireEvent.press(screen.getByTestId('progress-chart-touch'), {
      nativeEvent: { locationX: 900 },
    });
    expect(screen.getByTestId('progress-chart-readout')).toHaveTextContent(
      'Oct 1 · 12 reps · Push-up',
    );
  });

  it('copes with an empty series', async () => {
    await render(wrap(chart({ points: [] })));
    await ready('progress-chart-area');
    await measure();
    expect(screen.getByLabelText('Best set: no data')).toBeTruthy();
  });
});
