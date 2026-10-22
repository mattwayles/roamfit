import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { exerciseLibrary } from '@roamfit/data';
import { MuscleMap, MUSCLE_MAP_ASPECT } from './MuscleMap';

const exercise = exerciseLibrary.exercises[0]!;

describe('MuscleMap', () => {
  it('is decorative by default and sized from its height', async () => {
    await render(<MuscleMap exercise={exercise} height={52} accent="teal" testID="m" />);
    expect(screen.queryByTestId('m')).toBeNull();
    const svg = screen.getByTestId('m', { hidden: true });
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.height).toBe(52);
    expect(svg.props.width).toBe(Math.round(52 * MUSCLE_MAP_ASPECT));
  });

  it('is exposed when it carries a label', async () => {
    await render(
      <MuscleMap exercise={exercise} height={52} accent="teal" accessibilityLabel="Works chest" />,
    );
    expect(screen.getByLabelText('Works chest')).toBeTruthy();
  });
});
