import { Appearance, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { StoreProvider } from './src/state/StoreContext';
import { useBackupOnBackground } from './src/state/useBackupOnBackground';
import { ThemeProvider } from './src/state/ThemeProvider';
import { fontAssets, themeFor, useTheme } from './src/theme';

/**
 * Root: db + navigation wiring. Screens live in `src/screens/`; this file composes the providers
 * (`StoreProvider` for the `@roamfit/store` handle, `ThemeProvider` for Daylight / Golden Hour,
 * `NavigationContainer` + `StatusBar` following the theme) and holds the app on a blank `bg` view until Barlow / Barlow Condensed
 * are loaded, so text never flashes in a fallback face. (A font *error* falls through to system
 * fonts rather than bricking launch.) No business logic here.
 */
export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) {
    // Before the user's preference is readable: follow the OS (Golden Hour if it reports none).
    const bg = themeFor(Appearance.getColorScheme() === 'light' ? 'light' : 'dark').colors.bg;
    return <View style={{ flex: 1, backgroundColor: bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ThemeProvider>
          <ThemedShell />
        </ThemeProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

/** Everything that takes its chrome from the theme: navigation colors and the status bar. Also
 *  mounts the iCloud background-backup trigger once, under the store. */
function ThemedShell() {
  const theme = useTheme();
  useBackupOnBackground();
  return (
    <>
      <NavigationContainer theme={theme.navTheme}>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style={theme.statusBar} />
    </>
  );
}
