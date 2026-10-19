import React from 'react';
import { Animated } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { completionBadges } from '../lib/badges';
import { earnedRow } from '../lib/badges.fixtures';
import { ready } from '../ui/test-utils';
import BadgeEarnedCard from './BadgeEarnedCard';

const badge = completionBadges(['sessions_1'], [earnedRow('sessions_1', { sessionId: 's1' })])[0];

describe('BadgeEarnedCard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the eyebrow, name, description and a share button, and shares on tap', async () => {
    const onShare = jest.fn();
    render(<BadgeEarnedCard testID="b" badge={badge} revealed still={false} onShare={onShare} />);
    await ready('b');
    expect(screen.getByText('BADGE EARNED')).toBeTruthy();
    expect(screen.getByText(badge.def.name)).toBeTruthy();
    expect(screen.getByText(badge.def.description)).toBeTruthy();
    expect(screen.getByTestId('b-emblem').props.accessibilityLabel).toContain(badge.def.name);
    fireEvent.press(screen.getByTestId('b-share'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('pops the emblem in with a spring when revealed', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    render(<BadgeEarnedCard testID="b" badge={badge} revealed still={false} onShare={jest.fn()} />);
    await ready('b');
    // The delay wraps the spring in a sequence; the spring itself is created up front.
    expect(spring).toHaveBeenCalled();
  });

  it('Reduce Motion: the card is still, with no pop', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    render(<BadgeEarnedCard testID="b" badge={badge} revealed still onShare={jest.fn()} />);
    await ready('b');
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(screen.getByText(badge.def.name)).toBeTruthy();
  });

  it('is untappable until revealed', async () => {
    render(
      <BadgeEarnedCard
        testID="b"
        badge={badge}
        revealed={false}
        still={false}
        onShare={jest.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('b', { includeHiddenElements: true }).props.pointerEvents).toBe(
        'none',
      ),
    );
  });
});
