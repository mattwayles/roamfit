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
import { headerOptions, legacyLightContent } from './screenOptions';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root stack (DESIGN.md §4): the `Tabs` shell, then the full-screen flow screens (Generate ->
 * Approval -> Workout -> Summary, no tab bar) plus Settings and ExerciseDetail.
 */
export default function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{ ...headerOptions, ...legacyLightContent }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Generate" component={GenerateScreen} options={{ title: 'GENERATE' }} />
      <Stack.Screen name="Approval" component={ApprovalScreen} options={{ title: 'YOUR PLAN' }} />
      <Stack.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{ title: 'WORKOUT', headerBackVisible: false, gestureEnabled: false }}
      />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'SUMMARY' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'SETTINGS' }} />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: 'EXERCISE' }}
      />
    </Stack.Navigator>
  );
}
