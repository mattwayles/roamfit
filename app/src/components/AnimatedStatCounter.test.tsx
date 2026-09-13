/**
 * The completion screen's stat tiles should read as earned, not printed — see the component's own
 * header. This only proves the number lands on the right value (with its suffix) and starts below
 * it; it can't prove the count-up motion looks good, which is real-device territory like every
 * other animation in this file (`ConfettiBurst`, the completion banner spring).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import AnimatedStatCounter from './AnimatedStatCounter';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('AnimatedStatCounter', () => {
  it('settles on the given value, with its suffix appended', async () => {
    render(
      <AnimatedStatCounter
        testID="reps-counter"
        value={42}
        label="Total reps"
        duration={20}
        delay={0}
      />,
    );
    await waitFor(
      () => expect(screen.getByTestId('reps-counter-value')).toHaveTextContent('42'),
      WAIT_OPTS,
    );
    expect(screen.getByText('Total reps')).toBeTruthy();
  });

  it('appends a suffix without counting it', async () => {
    render(
      <AnimatedStatCounter
        testID="seconds-counter"
        value={90}
        label="Time under tension"
        suffix="s"
        duration={20}
        delay={0}
      />,
    );
    await waitFor(
      () => expect(screen.getByTestId('seconds-counter-value')).toHaveTextContent('90s'),
      WAIT_OPTS,
    );
  });

  it('renders zero correctly rather than an empty tile', async () => {
    render(<AnimatedStatCounter testID="zero-counter" value={0} label="Exercises" duration={20} />);
    await waitFor(
      () => expect(screen.getByTestId('zero-counter-value')).toHaveTextContent('0'),
      WAIT_OPTS,
    );
  });
});
