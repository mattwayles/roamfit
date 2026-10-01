/**
 * App wires the ThemeProvider: a forgotten provider would fail silently dark (the context default),
 * so assert the shell really follows the stored preference — the status bar is the visible proof.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { usersRepo } from '@roamfit/store';
import App from './App';
import { getDb } from './src/db';
import { nowUtcInstant } from './src/lib/localClock';

// Fonts never load under Jest; report them loaded so App renders its tree.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

// SafeAreaProvider renders nothing until the native side reports insets; hand it some.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  return {
    ...actual,
    SafeAreaProvider: (props: object) =>
      jest.requireActual('react').createElement(actual.SafeAreaProvider, {
        initialMetrics: metrics,
        ...props,
      }),
  };
});

let mockStatusStyle: string | undefined;
jest.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style?: string }) => {
    mockStatusStyle = style;
    return null;
  },
}));

afterAll(() => {
  usersRepo.updateUser(getDb(), { themePreference: 'system' }, nowUtcInstant());
});

describe('App theme wiring', () => {
  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)('preference %s -> status bar style %s', async (preference, style) => {
    usersRepo.updateUser(getDb(), { themePreference: preference }, nowUtcInstant());
    mockStatusStyle = undefined;
    let tree: ReturnType<typeof create> | undefined;
    await act(async () => {
      tree = create(<App />);
    });
    expect(mockStatusStyle).toBe(style);
    await act(async () => tree?.unmount());
  });
});
