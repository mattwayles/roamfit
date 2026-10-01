/**
 * Resolves the appearance preference ('system' | 'light' | 'dark') to a Theme and provides it
 * (docs/DESIGN.md §8.4). Lives in `state/` rather than `theme/` because it reads the user row via
 * `useStore`. The preference is read synchronously at mount (op-sqlite is sync), so the first
 * frame is already the right palette; 'system' follows React Native's `useColorScheme()`, which
 * re-renders on an iOS appearance change. Switching is live — no reload.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';
import { usersRepo, type ThemePreference } from '@roamfit/store';
import { nowUtcInstant } from '../lib/localClock';
import { ThemeContext, themeFor, type Scheme } from '../theme';
import { useStore } from './StoreContext';

export interface ThemePreferenceValue {
  preference: ThemePreference;
  /** What the preference resolves to right now. */
  scheme: Scheme;
  /** Persist (usersRepo) and apply a new preference. */
  setPreference: (next: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

/** 'system' with no reported scheme falls back to Golden Hour, the original look. */
export function resolveScheme(
  preference: ThemePreference,
  system: ColorSchemeName | null | undefined,
): Scheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return system === 'light' ? 'light' : 'dark';
}

export interface ThemeProviderProps {
  /** Skip the user-row read (tests). */
  initialPreference?: ThemePreference;
  children?: React.ReactNode;
}

export function ThemeProvider({
  initialPreference,
  children,
}: ThemeProviderProps): React.JSX.Element {
  const { db } = useStore();
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => initialPreference ?? usersRepo.getUser(db)?.themePreference ?? 'system',
  );

  const setPreference = useCallback(
    (next: ThemePreference) => {
      usersRepo.updateUser(db, { themePreference: next }, nowUtcInstant());
      setPreferenceState(next);
    },
    [db],
  );

  const scheme = resolveScheme(preference, system);
  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      <ThemeContext.Provider value={themeFor(scheme)}>{children}</ThemeContext.Provider>
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference() called outside <ThemeProvider>');
  return ctx;
}

/** Non-throwing variant: null without a provider. For optional chrome (the Workout theme toggle)
 *  on screens that unit tests render bare. */
export function useOptionalThemePreference(): ThemePreferenceValue | null {
  return useContext(ThemePreferenceContext);
}
