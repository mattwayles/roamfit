/** Generate under the Daylight theme: selected tiles are deep-pine fills with a white legend. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import GenerateScreen from './GenerateScreen';
import { StoreProvider } from '../state/StoreContext';
import { daylight, daylightTheme } from '../theme';
import { inDaylight } from '../ui/test-utils';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const nav = { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

describe('Generate in Daylight', () => {
  it('paints picks on paper, selected time chip and intensity in deep pine, legends in white', async () => {
    render(
      inDaylight(
        <StoreProvider>
          <GenerateScreen
            navigation={nav as never}
            route={{ key: 'Generate', name: 'Generate', params: undefined } as never}
          />
        </StoreProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('time-picker')).toBeTruthy(), WAIT_OPTS);

    const off = StyleSheet.flatten(screen.getByTestId('time-picker-option-45').props.style);
    expect(off.backgroundColor).toBe(daylight.surface);
    const on = StyleSheet.flatten(screen.getByTestId('time-picker-option-30').props.style);
    expect(on.backgroundColor).toBe(daylight.pine);
    expect(on.shadowOpacity).toBe(daylightTheme.glow(daylight.pine).shadowOpacity);
    // The selected numeral sits on that fill in `ink`, which is white in Daylight.
    const numeral = StyleSheet.flatten(screen.getByText('30').props.style);
    expect(numeral.color).toBe('#FFFFFF');

    await fireEvent.press(screen.getByTestId('focus-picker-option-legs'));
    const tile = StyleSheet.flatten(screen.getByTestId('focus-picker-option-legs').props.style);
    expect(tile.borderColor).toBe(daylightTheme.focus.legs);
  });
});
