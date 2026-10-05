/**
 * The stamped-on headline (DESIGN.md §5.9): every word is the real letters over a hard, zero-blur
 * `tealDeep` copy offset down-right, and the teal glow rides on that copy (one `textShadow` per
 * Text). The copy is invisible to accessibility, so the headline is still read once.
 */
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import HypeHeadline from './HypeHeadline';
import { daybreak, vivid, midnight } from '../theme';
import { inDaybreak } from '../ui/test-utils';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

async function renderHeadline(text: string) {
  render(<HypeHeadline text={text} bounce={new Animated.Value(0)} />);
  await waitFor(() => expect(screen.getByRole('header', { name: text })).toBeTruthy(), WAIT_OPTS);
}

const style = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, { hidden: true }).props.style) ?? {};

describe('HypeHeadline stamped shadow', () => {
  it('layers a hard tealDeep copy, offset down-right, beneath every word', async () => {
    await renderHeadline('BEAST MODE ACTIVATED');
    for (let i = 0; i < 3; i += 1) {
      const shadow = style(`hype-word-${i}-shadow`);
      expect(shadow.color).toBe(midnight.tealDeep);
      expect(shadow.position).toBe('absolute');
      expect(shadow.left).toBe(3);
      expect(shadow.top).toBe(4);
      // Same box as the real word (right mirrors left), so the copy never re-wraps.
      expect(shadow.right).toBe(-3);
    }
  });

  it('keeps the soft teal glow and leaves the real letters crisp, accent word in sun', async () => {
    await renderHeadline('BEAST MODE ACTIVATED');
    const glow = style('hype-word-0-shadow');
    expect(glow.textShadowColor).toContain('79,209,118');
    expect(glow.textShadowRadius).toBeGreaterThan(0);
    const word = style('hype-word-0');
    expect(word.color).toBe(midnight.text);
    expect(word.textShadowRadius).toBeUndefined();
    expect(style('hype-word-2').color).toBe(midnight.sun);
  });

  it('reads once: the shadow copies are hidden from accessibility', async () => {
    await renderHeadline('NAILED IT');
    expect(screen.getAllByText('NAILED')).toHaveLength(1);
    expect(screen.getAllByText('IT')).toHaveLength(1);
    expect(screen.getByTestId('hype-word-0-shadow', { hidden: true })).toBeTruthy();
  });
});

describe('HypeHeadline in Daybreak', () => {
  it('prints a deep-teal word over a hard vivid-gold copy, with no glow', async () => {
    render(inDaybreak(<HypeHeadline text="NAILED IT" bounce={new Animated.Value(0)} />));
    await waitFor(
      () => expect(screen.getByRole('header', { name: 'NAILED IT' })).toBeTruthy(),
      WAIT_OPTS,
    );
    const shadow = style('hype-word-1-shadow');
    expect(shadow.color).toBe(vivid.gold);
    expect(shadow.textShadowRadius).toBe(0);
    expect(shadow.left).toBe(3);
    expect(style('hype-word-1').color).toBe(daybreak.teal);
    expect(style('hype-word-0').color).toBe(daybreak.text);
  });
});
