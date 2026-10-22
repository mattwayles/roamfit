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

// Its own file: a second render after an async-heavy test hits a broken act environment.
describe('BadgesHero, fresh user', () => {
  it('a fresh user is pointed warmly at the first badge', async () => {
    render(hero([]));
    await ready('badges-hero');
    expect(screen.getByText('Your first badge')).toBeTruthy();
    expect(screen.getByTestId('badges-hero-name').props.children).toBe('First Steps');
    expect(screen.getByTestId('badges-hero-sub').props.children).toMatch(/\w/);
    expect(screen.getByTestId('badges-count').props.children).toMatch(/^0 of \d+ earned$/);
  });
});
