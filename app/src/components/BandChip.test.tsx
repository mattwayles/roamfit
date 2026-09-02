/**
 * Band chips — colour is the recognisable thing about a band; "B2" is not.
 *
 * Note for anyone adding cases here: under React 19 the render commits asynchronously, so
 * `screen` is not bound until the test awaits something. Every case below therefore awaits a
 * `waitFor` immediately after `render`, exactly as the screen tests do. A synchronous assertion
 * straight after `render` fails with "`render` function has not been called", which looks like a
 * broken component and is not.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_BAND_TENSIONS } from '@roamfit/store';
import BandChip, { textColorOn } from './BandChip';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('BandChip', () => {
  it('fills with the user’s own colour for that band', async () => {
    render(<BandChip band="B2" tensions={DEFAULT_BAND_TENSIONS} />);
    await waitFor(() => expect(screen.getByTestId('band-chip-B2')).toBeTruthy(), WAIT_OPTS);
    expect(
      StyleSheet.flatten(screen.getByTestId('band-chip-B2').props.style)?.backgroundColor,
    ).toBe(DEFAULT_BAND_TENSIONS.B2.color);
  });

  it('honours a customised colour and label, since bands are user-editable (§1140)', async () => {
    render(
      <BandChip
        band="B1"
        tensions={{ ...DEFAULT_BAND_TENSIONS, B1: { label: 'Thin orange', color: '#ff7f00' } }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('band-chip-B1')).toBeTruthy(), WAIT_OPTS);
    expect(
      StyleSheet.flatten(screen.getByTestId('band-chip-B1').props.style)?.backgroundColor,
    ).toBe('#ff7f00');
    expect(screen.getByText('Thin orange')).toBeTruthy();
  });

  it('keeps the label inside the chip — colour alone would exclude anyone who cannot tell two of the user’s bands apart', async () => {
    render(<BandChip band="B3" tensions={DEFAULT_BAND_TENSIONS} />);
    await waitFor(() => expect(screen.getByText('B3')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByLabelText('Band B3')).toBeTruthy();
  });

  it('picks readable text from the fill rather than a stored pairing', () => {
    // Yellow needs dark text, near-black needs light. A stored pairing would go stale the moment
    // a user changed a fill without changing its partner.
    expect(textColorOn('#facc15')).toBe('#0f172a');
    expect(textColorOn('#1f2937')).toBe('#ffffff');
    expect(textColorOn('#ffffff')).toBe('#0f172a');
    expect(textColorOn('#000000')).toBe('#ffffff');
    // Unparseable input must still render something legible, never crash.
    expect(textColorOn('rebeccapurple')).toBe('#0f172a');
  });

  it('every default band is distinguishable from its neighbours', () => {
    const colors = Object.values(DEFAULT_BAND_TENSIONS).map((b) => b.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
