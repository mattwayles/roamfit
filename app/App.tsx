import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { StoreProvider } from './src/state/StoreContext';
import { colors, fontAssets, navTheme } from './src/theme';

/**
 * Root: db + navigation wiring. Screens live in `src/screens/`; this file composes the providers
 * (`StoreProvider` for the `@roamfit/store` handle, `NavigationContainer` with the dark
 * "Golden Hour" theme) and holds the app on a blank `bg` view until Barlow / Barlow Condensed
 * are loaded, so text never flashes in a fallback face. (A font *error* falls through to system
 * fonts rather than bricking launch.) No business logic here.
 */
export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
