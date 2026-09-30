/* global expect */
/**
 * Shared helpers for the primitives' tests. Under React 19 `render` commits asynchronously, so
 * every case awaits `ready(...)` before touching `screen` (same convention as the component tests).
 */
import { screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

export const WAIT: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

export const ready = (testID: string) =>
  waitFor(() => expect(screen.getByTestId(testID)).toBeTruthy(), WAIT);

export const flat = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
