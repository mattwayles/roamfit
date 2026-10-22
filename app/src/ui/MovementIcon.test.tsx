import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MOVEMENT_GLYPHS, MovementIcon } from '.';

/** Every number in a path, as x/y pairs (the glyphs use only M/L/H/V/Q with absolute coords). */
function numbers(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe('movement glyphs', () => {
  it('stay inside the 24x24 grid', () => {
    for (const [pattern, g] of Object.entries(MOVEMENT_GLYPHS)) {
      const all = [...g.head, ...numbers(g.body), ...numbers(g.aux ?? '')];
      for (const n of all) {
        if (n < 0 || n > 24) throw new Error(`${pattern} has ${n} outside the grid`);
      }
    }
  });

  it('use only absolute M/L/H/V/Q commands', () => {
    for (const g of Object.values(MOVEMENT_GLYPHS)) {
      expect(`${g.body} ${g.aux ?? ''}`).toMatch(/^[MLHVQ\d.\s-]*$/);
    }
  });

  it('give each pattern its own drawing, except the abduction/adduction pair (arrow differs)', () => {
    const seen = new Map<string, string>();
    for (const [pattern, g] of Object.entries(MOVEMENT_GLYPHS)) {
      const key = `${g.head.join(',')}|${g.body}|${g.aux ?? ''}`;
      expect(seen.get(key)).toBeUndefined();
      seen.set(key, pattern);
    }
  });
});

describe('MovementIcon', () => {
  it('draws the figure and its scenery, hidden from VoiceOver by default', async () => {
    await render(<MovementIcon pattern="horizontal_pull" testID="m" />);
    expect(screen.queryByTestId('m')).toBeNull();
    const svg = screen.getByTestId('m', { hidden: true });
    expect(svg.props.accessibilityElementsHidden).toBe(true);
  });

  it('is exposed when it carries a label', async () => {
    await render(<MovementIcon pattern="squat" accessibilityLabel="Squat pattern" testID="m" />);
    expect(screen.getByLabelText('Squat pattern')).toBeTruthy();
  });
});
