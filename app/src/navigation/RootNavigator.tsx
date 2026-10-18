import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import Tabs from './Tabs';
import GenerateScreen from '../screens/GenerateScreen';
import ApprovalScreen from '../screens/ApprovalScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LimitationsScreen from '../screens/LimitationsScreen';
import AnchorSafetyScreen from '../screens/AnchorSafetyScreen';
import GlossaryScreen from '../screens/GlossaryScreen';
import TrainingPreferencesScreen from '../screens/TrainingPreferencesScreen';
import PlacementScreen from '../screens/PlacementScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import BandsScreen from '../screens/BandsScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root stack (DESIGN.md §4): the `Tabs` shell, then the full-screen flow screens (Generate ->
 * Approval -> Workout -> Summary, no tab bar) plus Settings and ExerciseDetail.
 */
export default function RootNavigator(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Stack.Navigator initialRouteName="Tabs" screenOptions={theme.headerOptions}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Generate" component={GenerateScreen} options={{ title: '' }} />
      <Stack.Screen name="Approval" component={ApprovalScreen} options={{ title: 'YOUR ROUTE' }} />
      {/* Workout draws its own top bar (home / elapsed clock / pause / stop) and is migrated: no
          native header, no legacy scene. The edge-swipe stays off so the bar is the way off it. */}
      <Stack.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: '' }} />
      {/* Settings draws its own h1 title; the native header stays for the back button. */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '' }} />
      {/* Settings' sub-pages draw their own h1; the native header stays for the back button. */}
      <Stack.Screen name="Limitations" component={LimitationsScreen} options={{ title: '' }} />
      <Stack.Screen name="AnchorSafety" component={AnchorSafetyScreen} options={{ title: '' }} />
      <Stack.Screen name="Glossary" component={GlossaryScreen} options={{ title: '' }} />
      <Stack.Screen name="Placement" component={PlacementScreen} options={{ title: '' }} />
      <Stack.Screen name="Bands" component={BandsScreen} options={{ title: '' }} />
      {/* Setup draws its own step header and footer, like the first-launch gate it reuses. */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="TrainingPreferences"
        component={TrainingPreferencesScreen}
        options={{ title: '' }}
      />
      {/* The detail page opens on a full-bleed focus-colour hero and draws its own back button over
          it; the edge-swipe back gesture stays on. */}
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ headerShown: false }}
      />
      {/* A finished workout, read-only. Draws its own title; the native header stays for back. */}
      <Stack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{ title: '' }}
      />
      {/* A movement group over time, read-only. Draws its own title. */}
    </Stack.Navigator>
  );
}
