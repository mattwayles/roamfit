/**
 * The chip as a control: tapping it must actually offer every band, and choosing one must report
 * it back. See BandChip.test.tsx's note on why every case awaits a `waitFor` after `render`.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_BAND_TENSIONS } from '@roamfit/store';
import BandPicker from './BandPicker';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('BandPicker', () => {
  it('shows only the current band until it is tapped', async () => {
    render(
      <BandPicker
        band="B2"
        tensions={DEFAULT_BAND_TENSIONS}
        onChange={jest.fn()}
        accessibilityLabel="Band for this set"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('band-picker')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('band-chip-B2')).toBeTruthy();
    expect(screen.queryByTestId('band-picker-options')).toBeNull();
    expect(screen.getByTestId('band-picker').props.accessibilityState.expanded).toBe(false);
  });

  it('opens to every band, each in the user’s own colour', async () => {
    render(
      <BandPicker
        band="B2"
        tensions={DEFAULT_BAND_TENSIONS}
        onChange={jest.fn()}
        accessibilityLabel="Band for this set"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('band-picker')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('band-picker'));

    await waitFor(() => expect(screen.getByTestId('band-picker-options')).toBeTruthy(), WAIT_OPTS);
    for (const id of ['B1', 'B2', 'B3', 'B4', 'B5'] as const) {
      const option = screen.getByTestId(`band-picker-option-${id}`);
      expect(StyleSheet.flatten(option.props.style)?.backgroundColor).toBe(
        DEFAULT_BAND_TENSIONS[id].color,
      );
    }
    expect(screen.getByTestId('band-picker-option-B2').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('reports the chosen band and closes', async () => {
    const onChange = jest.fn();
    render(
      <BandPicker
        band="B2"
        tensions={DEFAULT_BAND_TENSIONS}
        onChange={onChange}
        accessibilityLabel="Band for this set"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('band-picker')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('band-picker'));
    await waitFor(
      () => expect(screen.getByTestId('band-picker-option-B4')).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('band-picker-option-B4'));

    expect(onChange).toHaveBeenCalledWith('B4');
    await waitFor(() => expect(screen.queryByTestId('band-picker-options')).toBeNull(), WAIT_OPTS);
  });

  it('uses the user’s own labels, since bands are user-editable (§1140)', async () => {
    render(
      <BandPicker
        band="B1"
        tensions={{ ...DEFAULT_BAND_TENSIONS, B1: { label: 'Thin orange', color: '#ff7f00' } }}
        onChange={jest.fn()}
        testID="planned-band"
        accessibilityLabel="Planned band"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('planned-band')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('planned-band'));
    await waitFor(
      () => expect(screen.getByTestId('planned-band-option-B1')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getByLabelText('Thin orange')).toBeTruthy();
  });
});
