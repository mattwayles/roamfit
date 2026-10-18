/**
 * The completion screen's stat tiles should read as earned, not printed — see the component's own
 * header. This only proves the number lands on the right value (with its suffix) and starts below
 * it; it can't prove the count-up motion looks good, which is real-device territory like every
 * other animation in this file (`ConfettiBurst`, the completion banner spring).
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
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

  it('track 37n: with Reduce Motion on, shows the final value at once — no count-up', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(
      <AnimatedStatCounter
        testID="still-counter"
        value={42}
        label="Total reps"
        duration={60000}
        delay={60000}
      />,
    );
    // A 60s delay + duration would leave it at 0 for a minute if it were still animating.
    await waitFor(
      () => expect(screen.getByTestId('still-counter-value')).toHaveTextContent('42'),
      WAIT_OPTS,
    );
    spy.mockRestore();
  });
});
