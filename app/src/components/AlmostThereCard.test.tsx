import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { buildBadgeShelf } from '../lib/badges';
import { emptyBadgeFacts } from '../lib/badges.fixtures';
import { ready } from '../ui/test-utils';
import { AlmostThereCard } from './AlmostThereCard';

function badge(id: string, facts: Parameters<typeof emptyBadgeFacts>[0]) {
  return buildBadgeShelf([], emptyBadgeFacts(facts))
    .sections.flatMap((s) => s.badges)
    .find((b) => b.def.id === id)!;
}

describe('AlmostThereCard', () => {
  it('shows progress with a bar, the within-reach label and a Hard pre-fill', async () => {
    const onGenerate = jest.fn();
    render(
      <AlmostThereCard
        badge={badge('hard_sessions_10', { hardSessionsCompleted: 9 })}
        onPress={() => {}}
        onGenerate={onGenerate}
      />,
    );
    await ready('badges-almost-hard_sessions_10');
    expect(screen.getByText('9 of 10')).toBeTruthy();
    expect(
      screen.getByTestId('badges-almost-bar-hard_sessions_10', { hidden: true }).props.children
        .props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ width: '90%' })]));
    expect(screen.getByText('Within reach today')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('badges-reach-action-hard_sessions_10'));
    expect(onGenerate).toHaveBeenCalledWith({ difficulty: 'hard' });
  });
});
