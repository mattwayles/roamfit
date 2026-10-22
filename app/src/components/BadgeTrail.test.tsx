import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BADGES } from '@roamfit/engine';
import { buildBadgeShelf, buildSeriesTrails } from '../lib/badges';
import { earnedRow, emptyBadgeFacts } from '../lib/badges.fixtures';
import { ready } from '../ui/test-utils';
import { BadgeSeriesList, BadgeTrail, trailLabel, trailNodeSizes } from './BadgeTrail';

const trailOf = (earnedIds: string[], series = 'sessions', over = {}) => {
  const shelf = buildBadgeShelf(
    earnedIds.map((id) => earnedRow(id)),
    emptyBadgeFacts({ sessionsCompleted: 20, ...over }),
  );
  return buildSeriesTrails(shelf.sections)
    .flatMap((s) => s.trails)
    .find((t) => t.series === series)!;
};

describe('trailNodeSizes', () => {
  it('shrinks earned emblems to fit a narrow strip, never below the floor', () => {
    const t = trailOf(['sessions_1', 'sessions_5', 'sessions_10', 'sessions_25', 'sessions_50']);
    const wide = trailNodeSizes(t, 320);
    const narrow = trailNodeSizes(t, 200);
    expect(wide.earned).toBe(28);
    expect(narrow.earned).toBeLessThan(wide.earned);
    expect(trailNodeSizes(t, 50).earned).toBe(16);
  });

  it('needs no current node once the series is done', () => {
    const ids = BADGES.filter((b) => b.series === 'sessions').map((b) => b.id);
    expect(trailNodeSizes(trailOf(ids), 300).earned).toBeGreaterThanOrEqual(16);
  });
});

describe('BadgeTrail', () => {
  it('names the current badge with neutral progress and labels the row', async () => {
    const t = trailOf(['sessions_1', 'sessions_5', 'sessions_10']);
    const onPress = jest.fn();
    render(<BadgeTrail trail={t} onPress={onPress} />);
    await ready('trail-sessions');
    expect(screen.getByTestId('trail-sessions-title').props.children).toBe(t.current!.def.name);
    expect(screen.getByTestId('trail-sessions-sub').props.children).toBe('20 of 25');
    expect(screen.getByTestId('trail-sessions').props.accessibilityLabel).toBe(
      `${t.current!.def.name}, 3 of 8 earned, 20 of 25`,
    );
    expect(screen.getByTestId('trail-sessions-node-7', { hidden: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('trail-sessions'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a NEW dot only while a tier is unseen', async () => {
    const t = trailOf(['sessions_1']);
    render(<BadgeTrail trail={t} onPress={() => {}} />);
    await ready('trail-sessions');
    expect(screen.getByTestId('trail-sessions-new')).toBeTruthy();
  });

  it('labels a finished trail without a progress count', () => {
    const ids = BADGES.filter((b) => b.series === 'sessions').map((b) => b.id);
    expect(trailLabel(trailOf(ids))).toMatch(/, 8 of 8 earned$/);
  });
});

describe('BadgeSeriesList', () => {
  it('lists every tier with a date or neutral progress and reports taps', async () => {
    const t = trailOf(['sessions_1', 'sessions_5']);
    const onSelect = jest.fn();
    render(<BadgeSeriesList trail={t} onSelect={onSelect} />);
    await ready('trail-sheet-list');
    expect(screen.getByTestId('trail-tier-sessions_1-meta').props.children).toMatch(/^Earned /);
    expect(screen.getByTestId('trail-tier-sessions_10-meta').props.children).toBe(
      '20 of 10'.replace('20', '10'),
    );
    expect(screen.getByTestId('trail-tier-sessions_500').props.accessibilityLabel).toMatch(
      /locked, \d+ of 500$/,
    );
    fireEvent.press(screen.getByTestId('trail-tier-sessions_10'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ def: expect.objectContaining({ id: 'sessions_10' }) }),
    );
  });
});
