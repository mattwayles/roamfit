/**
 * The confirm step, per variant. Both variants confirm in a bottom `Sheet` over the screen and
 * leave the trigger where it was (the `icon` variant sits in the Workout screen's top bar, where
 * rendering the confirm box *in place of* the button once stretched the row and pushed the dialog
 * off the right edge — real device report). The safe choice, "Keep going", is the primary button.
 *
 * (As in `BandChip.test.tsx`: under React 19 the render commits asynchronously, so each case
 * awaits a `waitFor` before touching `screen`.)
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AbandonSessionButton from './AbandonSessionButton';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('AbandonSessionButton confirm step', () => {
  it('icon variant confirms in an overlay that leaves the control row intact', async () => {
    const onConfirm = jest.fn();
    render(<AbandonSessionButton onConfirm={onConfirm} variant="icon" />);
    await waitFor(() => expect(screen.getByTestId('abandon-button')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);

    // The stop button is still mounted: the dialog floats above the row rather than replacing the
    // button inside it, which is what kept the row from being stretched off-screen.
    expect(screen.getByTestId('abandon-button')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('abandon-confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('abandon-confirm-row')).toBeNull(), WAIT_OPTS);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-yes')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('abandon-confirm-yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Discarding dismisses the dialog itself — the screen it navigates away from stays mounted
    // in the stack, so a modal left open would hang over the destination screen.
    await waitFor(() => expect(screen.queryByTestId('abandon-confirm-row')).toBeNull(), WAIT_OPTS);
  });

  it('text variant confirms in the same sheet, and backdrop / "Keep going" both mean not yet', async () => {
    const onConfirm = jest.fn();
    render(<AbandonSessionButton onConfirm={onConfirm} />);
    await waitFor(() => expect(screen.getByTestId('abandon-button')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);
    // The link stays put; the confirm is an overlay, not a replacement.
    expect(screen.getByTestId('abandon-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('abandon-sheet-backdrop'));
    await waitFor(() => expect(screen.queryByTestId('abandon-confirm-row')).toBeNull(), WAIT_OPTS);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-yes')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('abandon-confirm-yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
