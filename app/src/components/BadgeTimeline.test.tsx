import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ready } from '../ui/test-utils';
import { BadgeTimeline } from './BadgeTimeline';

describe('BadgeTimeline', () => {
  it('a fresh user gets a warm empty state', async () => {
    render(<BadgeTimeline groups={[]} onOpenBadge={() => {}} onOpenSession={() => {}} />);
    await ready('badge-timeline-empty');
    expect(screen.getByText('Your timeline starts with your first badge')).toBeTruthy();
  });
});
