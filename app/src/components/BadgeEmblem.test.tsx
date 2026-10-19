import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BADGES } from '@roamfit/engine';
import { buildBadgeShelf } from '../lib/badges';
import { earnedRow, emptyBadgeFacts } from '../lib/badges.fixtures';
import { inDaybreak, ready } from '../ui/test-utils';
import { BadgeEmblem } from './BadgeEmblem';

const shelf = buildBadgeShelf(
  [earnedRow('sessions_1', { localDate: '2026-10-01' })],
  emptyBadgeFacts({ sessionsCompleted: 3 }),
);
const all = shelf.sections.flatMap((s) => s.badges);
const pick = (id: string) => all.find((b) => b.def.id === id)!;

describe('BadgeEmblem', () => {
  it('labels an earned badge with its name and date', async () => {
    render(<BadgeEmblem badge={pick('sessions_1')} testID="e" />);
    await ready('e');
    expect(screen.getByTestId('e').props.accessibilityLabel).toBe(
      'First Steps, earned Thursday, October 1, 2026',
    );
  });

  it('labels a locked badge with neutral progress', async () => {
    render(<BadgeEmblem badge={pick('sessions_5')} testID="e" />);
    await ready('e');
    expect(screen.getByTestId('e').props.accessibilityLabel).toBe(
      `${pick('sessions_5').def.name}, locked, 3 of 5`,
    );
  });

  it('shows a ? and keeps a hidden locked badge unnamed', async () => {
    render(<BadgeEmblem badge={pick('early_bird_1')} testID="e" />);
    await ready('e');
    expect(screen.getByTestId('e').props.accessibilityLabel).toBe('Hidden badge, locked');
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('draws every catalog badge in every shape, size and theme without throwing', async () => {
    const sizes = [40, 64, 120] as const;
    const defs = BADGES.filter((b) => b.tier === 'bronze' || b.tier === 'summit').slice(0, 12);
    const rows = defs.map((d) => earnedRow(d.id));
    const s = buildBadgeShelf(rows, emptyBadgeFacts());
    const badges = s.sections.flatMap((x) => x.badges);
    render(
      inDaybreak(
        <>
          {badges.map((b, i) => (
            <BadgeEmblem key={b.def.id} badge={b} size={sizes[i % 3]} testID={`d-${b.def.id}`} />
          ))}
        </>,
      ),
    );
    await ready(`d-${badges[0]!.def.id}`);
  });

  it('shows a NEW dot only when asked', async () => {
    render(<BadgeEmblem badge={pick('sessions_1')} showNew testID="e" />);
    await ready('e-new');
  });
});
