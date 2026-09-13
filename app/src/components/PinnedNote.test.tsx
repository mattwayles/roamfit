/**
 * The multi-line note has no return key that dismisses it — pressing return inserts a newline
 * instead. Without an accessory bar, the only way out of the field was the workout screen's own
 * chrome (scroll, tap another control), which is the friction this fixes.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import PinnedNote from './PinnedNote';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('PinnedNote accessory bar', () => {
  it('renders a Done control that dismisses the keyboard', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const onChange = jest.fn();
    render(<PinnedNote note="row to the hips" onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('pinned-note-done')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('pinned-note-done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);

    dismissSpy.mockRestore();
  });

  it('still saves on blur when the draft changed', async () => {
    const onChange = jest.fn();
    render(<PinnedNote note="row to the hips" onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('pinned-note-input')).toBeTruthy(), WAIT_OPTS);

    fireEvent.changeText(screen.getByTestId('pinned-note-input'), 'row to the chest');
    await waitFor(() =>
      expect(screen.getByTestId('pinned-note-input').props.value).toBe('row to the chest'),
    );
    fireEvent(screen.getByTestId('pinned-note-input'), 'blur');
    expect(onChange).toHaveBeenCalledWith('row to the chest');
  });
});
