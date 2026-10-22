import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { buildBadgeShelf, buildSeriesTrails, tierTally } from '../lib/badges';
import { earnedRow, emptyBadgeFacts } from '../lib/badges.fixtures';
import { ready } from '../ui/test-utils';
import { BadgesHero } from './BadgesHero';

function hero(
  rows: ReturnType<typeof earnedRow>[],
  over: Partial<React.ComponentProps<typeof BadgesHero>> = {},
) {
  const shelf = buildBadgeShelf(rows, emptyBadgeFacts());
  return (
    <BadgesHero
      earnedCount={shelf.earnedCount}
      totalCount={shelf.totalCount}
      latest={shelf.recent[0] ?? null}
      next={shelf.next}
      sections={buildSeriesTrails(shelf.sections)}
      tally={tierTally(shelf)}
      onOpenBadge={() => {}}
      onJump={() => {}}
      {...over}
    />
  );
}

describe('BadgesHero', () => {
  it('features the newest earned badge, with the count, patches and tier tally', async () => {
    const onOpenBadge = jest.fn();
    const onJump = jest.fn();
    render(
      hero(
        [
          earnedRow('sessions_1', { earnedAt: '2026-10-01T12:00:00.000Z' }),
          earnedRow('sessions_5', {
            earnedAt: '2026-10-05T12:00:00.000Z',
            localDate: '2026-10-05',
          }),
        ],
        { onOpenBadge, onJump },
      ),
    );
    await ready('badges-hero');
    expect(screen.getByTestId('badges-hero-name').props.children).toBe('Trailhead');
    expect(screen.getByTestId('badges-hero-sub').props.children).toBe(
      'Earned Monday, October 5, 2026',
    );
    expect(screen.getByTestId('badges-count').props.children).toMatch(/^2 of \d+ earned$/);
    expect(screen.getByTestId('badges-patch-showing_up').props.accessibilityLabel).toMatch(
      /^Showing up, 2 of \d+ earned$/,
    );
    expect(screen.getByTestId('badges-tally').props.accessibilityLabel).toMatch(
      /^Earned by tier: /,
    );
    fireEvent.press(screen.getByTestId('badges-patch-climbing'));
    expect(onJump).toHaveBeenCalledWith('climbing');
    fireEvent.press(screen.getByTestId('badges-hero-featured'));
    expect(onOpenBadge).toHaveBeenCalledWith(expect.objectContaining({ earned: true }));
  });
});
