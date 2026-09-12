import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { StoreProvider } from './src/state/StoreContext';

/**
 * Wave 4 root: db + navigation wiring. Screens live in `src/screens/`; this file only composes
 * the providers (`StoreProvider` for the `@roamfit/store` handle, `NavigationContainer` for the
 * §10.1–§10.9 flow) — no business logic here.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
