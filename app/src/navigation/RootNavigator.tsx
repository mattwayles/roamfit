import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import Tabs from './Tabs';
import GenerateScreen from '../screens/GenerateScreen';
import ApprovalScreen from '../screens/ApprovalScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import { headerOptions } from './screenOptions';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root stack (DESIGN.md §4): the `Tabs` shell, then the full-screen flow screens (Generate ->
 * Approval -> Workout -> Summary, no tab bar) plus Settings and ExerciseDetail.
 */
export default function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName="Tabs" screenOptions={headerOptions}>
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
      {/* The detail page opens on a full-bleed focus-colour hero and draws its own back button over
          it; the edge-swipe back gesture stays on. */}
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
