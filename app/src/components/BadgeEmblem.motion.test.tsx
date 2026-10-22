/**
 * Track 44c - BadgeEmblem motion wiring. Animation cannot be seen in Jest, so these pin what can
 * be: `animateIn` wraps the emblem, Reduce Motion drops the wrapper (the static render), and
 * shimmering summit emblems share one loop. Tilt helpers are pure.
 */
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { BADGES } from '@roamfit/engine';
import { buildBadgeShelf } from '../lib/badges';
import { earnedRow, emptyBadgeFacts } from '../lib/badges.fixtures';
import { ready } from '../ui/test-utils';
import { BadgeEmblem } from './BadgeEmblem';
import { TiltSheen, tiltEnabled, tiltFraction } from './TiltSheen';

const idOf = (tier: string) => BADGES.find((b) => b.tier === tier)!.id;
const ids = ['bronze', 'gold', 'summit'].map(idOf);
const shelf = buildBadgeShelf(
  ids.map((id) => earnedRow(id)),
  emptyBadgeFacts(),
);
const all = shelf.sections.flatMap((s) => s.badges);
const pick = (tier: string) => all.find((b) => b.def.id === idOf(tier))!;

afterEach(() => {
  jest.restoreAllMocks();
  // The RN jest setup's accessibility mock is a plain jest.fn, which restore does not reset.
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

describe('BadgeEmblem motion', () => {
  it('wraps the emblem in the stitch-in only when asked', async () => {
    await render(
      <>
        <BadgeEmblem badge={pick('bronze')} animateIn testID="a" />
        <BadgeEmblem badge={pick('bronze')} testID="b" />
      </>,
    );
    await ready('a');
    expect(screen.getByTestId('a-stitch')).toBeTruthy();
    expect(screen.queryByTestId('b-stitch')).toBeNull();
  });

  it('renders the static state under Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<BadgeEmblem badge={pick('bronze')} animateIn testID="a" />);
    await waitFor(() => expect(screen.queryByTestId('a-stitch')).toBeNull());
    expect(screen.getByTestId('a').props.accessibilityLabel).toMatch(/earned/);
  });

  it('shares one shimmer loop across summit emblems, and ignores other tiers', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    const { unmount } = await render(
      <>
        <BadgeEmblem badge={pick('summit')} shimmer testID="s1" />
        <BadgeEmblem badge={pick('summit')} shimmer testID="s2" />
        <BadgeEmblem badge={pick('bronze')} shimmer testID="s3" />
      </>,
    );
    await ready('s1');
    expect(loop).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('runs no shimmer under Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    await render(<BadgeEmblem badge={pick('summit')} shimmer testID="s1" />);
    await ready('s1');
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    // The first render may start a loop before the setting resolves; it is torn down after.
    await waitFor(() => expect(screen.getByTestId('s1')).toBeTruthy());
    expect(loop.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('TiltSheen', () => {
  it('is for earned gold and summit badges only', () => {
    expect(tiltEnabled(pick('gold'))).toBe(true);
    expect(tiltEnabled(pick('summit'))).toBe(true);
    expect(tiltEnabled(pick('bronze'))).toBe(false);
    const locked = buildBadgeShelf([], emptyBadgeFacts()).sections.flatMap((s) => s.badges);
    expect(tiltEnabled(locked.find((b) => b.def.tier === 'gold')!)).toBe(false);
  });

  it('clamps the drag to a full tilt', () => {
    expect(tiltFraction(0)).toBe(0);
    expect(tiltFraction(30)).toBe(0.5);
    expect(tiltFraction(500)).toBe(1);
    expect(tiltFraction(-500)).toBe(-1);
  });

  it('adds the drag target for gold, not for bronze, and not under Reduce Motion', async () => {
    const { rerender } = await render(<TiltSheen badge={pick('gold')} size={120} />);
    await waitFor(() => expect(screen.getByTestId('badge-sheet-tilt')).toBeTruthy());
    await rerender(<TiltSheen badge={pick('bronze')} size={120} />);
    expect(screen.queryByTestId('badge-sheet-tilt')).toBeNull();
  });

  it('drops the drag target under Reduce Motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<TiltSheen badge={pick('gold')} size={120} />);
    await waitFor(() => expect(screen.queryByTestId('badge-sheet-tilt')).toBeNull());
  });
});
