/**
 * `ThemeContext` + `useTheme()` + `makeStyles()`. The default value is Midnight, so anything
 * rendered without a ThemeProvider (most existing tests) looks exactly as it always did — which
 * also means a forgotten provider fails silently dark; App.tsx has the provider, a test asserts it.
 */
import { createContext, useContext } from 'react';
import { midnightTheme, type Theme } from './buildTheme';

export const ThemeContext = createContext<Theme>(midnightTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Themed styles as a hook: `const useStyles = makeStyles((t) => StyleSheet.create({...}))` at
 * module scope, `const styles = useStyles()` in the component. The factory runs at most once per
 * Theme instance (two exist), so this costs the same as a module-level StyleSheet.
 */
export function makeStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (styles === undefined) {
      styles = factory(theme);
      cache.set(theme, styles);
    }
    return styles;
  };
}
