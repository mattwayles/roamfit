import React from 'react';
import { StyleSheet } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import {
  ThemeContext,
  daylight,
  daylightTheme,
  goldenHour,
  goldenHourTheme,
  makeStyles,
  useTheme,
  type Theme,
} from './index';

const wrap = (theme: Theme) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
  };

describe('useTheme', () => {
  it('defaults to Golden Hour with no provider', async () => {
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toBe(goldenHourTheme);
  });

  it('returns the provided theme', async () => {
    const { result } = await renderHook(() => useTheme(), { wrapper: wrap(daylightTheme) });
    expect(result.current).toBe(daylightTheme);
  });
});

describe('makeStyles', () => {
  it('runs the factory once per theme instance and returns the cached sheet', async () => {
    const factory = jest.fn((t: Theme) => StyleSheet.create({ a: { color: t.colors.text } }));
    const useStyles = makeStyles(factory);

    const dark1 = await renderHook(() => useStyles(), { wrapper: wrap(goldenHourTheme) });
    const dark2 = await renderHook(() => useStyles(), { wrapper: wrap(goldenHourTheme) });
    const light = await renderHook(() => useStyles(), { wrapper: wrap(daylightTheme) });
    await light.rerender({});

    expect(dark1.result.current).toBe(dark2.result.current);
    expect(light.result.current).not.toBe(dark1.result.current);
    expect(light.result.current.a.color).toBe(daylight.text);
    expect(dark1.result.current.a.color).toBe(goldenHour.text);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
