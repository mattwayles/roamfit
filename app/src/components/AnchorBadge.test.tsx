/**
 * The anchor badge decides one thing: whether this exercise needs a fixed point in the world, and
 * what to call it. Everything self-anchored has to stay silent — a badge on most of the library
 * would teach the eye to skip the one case it exists for.
 *
 * The `await waitFor` after every `render` is not incidental: under React 19 the commit is
 * asynchronous and `screen` is unbound until the test awaits something. See `BandChip.test.tsx`'s
 * header. The absence case renders a sentinel alongside the badge and waits for *that*, so it
 * asserts "committed, and the badge is not there" rather than "hasn't rendered yet".
 */
import React from 'react';
import { View } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { Anchor } from '@roamfit/data';
import AnchorBadge, { anchorLabel } from './AnchorBadge';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

/** Renders the badge next to a sentinel, so absence can be told apart from "not yet committed". */
async function renderBadge(anchor: Anchor | null, anchorAlt?: Anchor | null) {
  render(
    <View testID="sentinel">
      <AnchorBadge anchor={anchor} anchorAlt={anchorAlt} />
    </View>,
  );
  await waitFor(() => expect(screen.getByTestId('sentinel')).toBeTruthy(), WAIT_OPTS);
}

describe('AnchorBadge', () => {
  it('names the three band anchor heights, which is what it exists for', () => {
    expect(anchorLabel('anchor-low')).toBe('Low anchor');
    expect(anchorLabel('anchor-mid')).toBe('Middle anchor');
    expect(anchorLabel('anchor-high')).toBe('High anchor');
  });

  it('names the bodyweight-bearing fixed points too — "needs nothing" is the wrong reading for a hang', () => {
    expect(anchorLabel('low-bar')).toBe('Waist-height bar');
    expect(anchorLabel('pullup-bar')).toBe('Pull-up bar');
    expect(anchorLabel('body-support')).toBe('Bench or step');
  });

  it('says nothing for anything self-anchored: there is no fixed point to go and find', () => {
    for (const anchor of ['none', 'stance', 'feet', 'self-low', 'thigh-loop'] as Anchor[]) {
      expect(anchorLabel(anchor)).toBeNull();
    }
    expect(anchorLabel(null)).toBeNull();
  });

  it('renders the label when a fixed point is needed', async () => {
    await renderBadge('anchor-high');
    expect(screen.getByTestId('anchor-badge')).toBeTruthy();
    expect(screen.getByText('High anchor')).toBeTruthy();
  });

  it('renders no badge at all — not an empty one — when nothing is needed', async () => {
    await renderBadge('stance');
    expect(screen.queryByTestId('anchor-badge')).toBeNull();
  });

  it('names both options when an alternative anchor is given', async () => {
    await renderBadge('anchor-low', 'anchor-mid');
    expect(screen.getByText('Low anchor or middle anchor')).toBeTruthy();
  });

  it('falls back to the single anchor when there is no alternative', async () => {
    await renderBadge('anchor-low', null);
    expect(screen.getByText('Low anchor')).toBeTruthy();
  });

  it('ignores an alt anchor with no label of its own (self-anchored) and shows just the primary', async () => {
    await renderBadge('anchor-low', 'stance');
    expect(screen.getByText('Low anchor')).toBeTruthy();
  });
});
