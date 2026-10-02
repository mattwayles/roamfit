/**
 * The stamped-on headline (DESIGN.md §5.9): every word is the real letters over a hard, zero-blur
 * `pineDeep` copy offset down-right, and the pine glow rides on that copy (one `textShadow` per
 * Text). The copy is invisible to accessibility, so the headline is still read once.
 */
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import HypeHeadline from './HypeHeadline';
import { daylight, vivid, goldenHour } from '../theme';
import { inDaylight } from '../ui/test-utils';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

async function renderHeadline(text: string) {
  render(<HypeHeadline text={text} bounce={new Animated.Value(0)} />);
  await waitFor(() => expect(screen.getByRole('header', { name: text })).toBeTruthy(), WAIT_OPTS);
}

const style = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, { hidden: true }).props.style) ?? {};

describe('HypeHeadline stamped shadow', () => {
  it('layers a hard pineDeep copy, offset down-right, beneath every word', async () => {
    await renderHeadline('BEAST MODE ACTIVATED');
    for (let i = 0; i < 3; i += 1) {
      const shadow = style(`hype-word-${i}-shadow`);
      expect(shadow.color).toBe(goldenHour.pineDeep);
      expect(shadow.position).toBe('absolute');
      expect(shadow.left).toBe(3);
      expect(shadow.top).toBe(4);
      // Same box as the real word (right mirrors left), so the copy never re-wraps.
      expect(shadow.right).toBe(-3);
    }
  });

  it('keeps the soft pine glow and leaves the real letters crisp, accent word in sun', async () => {
    await renderHeadline('BEAST MODE ACTIVATED');
    const glow = style('hype-word-0-shadow');
    expect(glow.textShadowColor).toContain('79,209,118');
    expect(glow.textShadowRadius).toBeGreaterThan(0);
    const word = style('hype-word-0');
    expect(word.color).toBe(goldenHour.text);
    expect(word.textShadowRadius).toBeUndefined();
    expect(style('hype-word-2').color).toBe(goldenHour.sun);
  });

  it('reads once: the shadow copies are hidden from accessibility', async () => {
    await renderHeadline('NAILED IT');
    expect(screen.getAllByText('NAILED')).toHaveLength(1);
    expect(screen.getAllByText('IT')).toHaveLength(1);
    expect(screen.getByTestId('hype-word-0-shadow', { hidden: true })).toBeTruthy();
  });
});

describe('HypeHeadline in Daylight', () => {
  it('prints a deep-pine word over a hard vivid-gold copy, with no glow', async () => {
    render(inDaylight(<HypeHeadline text="NAILED IT" bounce={new Animated.Value(0)} />));
    await waitFor(
      () => expect(screen.getByRole('header', { name: 'NAILED IT' })).toBeTruthy(),
      WAIT_OPTS,
    );
    const shadow = style('hype-word-1-shadow');
    expect(shadow.color).toBe(vivid.gold);
    expect(shadow.textShadowRadius).toBe(0);
    expect(shadow.left).toBe(3);
    expect(style('hype-word-1').color).toBe(daylight.pine);
    expect(style('hype-word-0').color).toBe(daylight.text);
  });
});
