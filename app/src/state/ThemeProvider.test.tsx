/**
 * ThemeProvider against the real on-device store: 'system' follows the OS, an explicit choice
 * overrides it, a stored preference is read at mount, and setPreference persists and re-renders
 * live (no reload).
 */
import React from 'react';
import { Text, type ColorSchemeName } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { usersRepo, type ThemePreference } from '@roamfit/store';
import { getDb } from '../db';
import { nowUtcInstant } from '../lib/localClock';
import { daylight, goldenHour, useTheme } from '../theme';
import { StoreProvider } from './StoreContext';
import { ThemeProvider, resolveScheme, useThemePreference } from './ThemeProvider';

// RN's `useColorScheme` imports `getColorScheme` directly, so spying on `Appearance` can't reach it.
let mockScheme: ColorSchemeName = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme,
}));

const WAIT = { timeout: 5000, interval: 50 };

function Probe() {
  const theme = useTheme();
  const { preference, scheme, setPreference } = useThemePreference();
  probeApi.setPreference = setPreference;
  return (
    <>
      <Text testID="bg">{theme.colors.bg}</Text>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="pref">{preference}</Text>
    </>
  );
}
const probeApi: { setPreference: (p: ThemePreference) => void } = { setPreference: () => {} };

async function mount(initialPreference?: ThemePreference) {
  await render(
    <StoreProvider>
      <ThemeProvider initialPreference={initialPreference}>
        <Probe />
      </ThemeProvider>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('bg')).toBeTruthy(), WAIT);
}
const text = (id: string) => screen.getByTestId(id).props.children as string;

beforeEach(() => {
  usersRepo.updateUser(getDb(), { themePreference: 'system' }, nowUtcInstant());
});
afterEach(() => {
  jest.restoreAllMocks();
  mockScheme = 'light';
});

describe('resolveScheme', () => {
  it('explicit wins, system follows the OS, no OS scheme falls back to Golden Hour', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
  });
});

describe('ThemeProvider', () => {
  it('system follows the OS color scheme', async () => {
    mockScheme = 'light';
    await mount();
    expect(text('pref')).toBe('system');
    expect(text('scheme')).toBe('light');
    expect(text('bg')).toBe(daylight.bg);
  });

  it('system on a dark OS is Golden Hour', async () => {
    mockScheme = 'dark';
    await mount();
    expect(text('bg')).toBe(goldenHour.bg);
  });

  it('an explicit preference overrides the OS', async () => {
    mockScheme = 'dark';
    await mount('light');
    expect(text('scheme')).toBe('light');
    expect(text('bg')).toBe(daylight.bg);
  });

  it('reads the stored preference from the user row at mount', async () => {
    mockScheme = 'dark';
    usersRepo.updateUser(getDb(), { themePreference: 'light' }, nowUtcInstant());
    await mount();
    expect(text('pref')).toBe('light');
    expect(text('bg')).toBe(daylight.bg);
  });

  it('setPreference persists to the user row and re-renders live', async () => {
    mockScheme = 'dark';
    await mount();
    expect(text('bg')).toBe(goldenHour.bg);

    await act(async () => probeApi.setPreference('light'));
    expect(text('pref')).toBe('light');
    expect(text('bg')).toBe(daylight.bg);
    expect(usersRepo.getUser(getDb())!.themePreference).toBe('light');

    await act(async () => probeApi.setPreference('dark'));
    expect(text('bg')).toBe(goldenHour.bg);
    expect(usersRepo.getUser(getDb())!.themePreference).toBe('dark');
  });

  it('useThemePreference outside a provider throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow(/ThemeProvider/);
  });
});
