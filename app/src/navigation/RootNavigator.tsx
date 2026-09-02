import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import GenerateScreen from '../screens/GenerateScreen';
import ApprovalScreen from '../screens/ApprovalScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'RoamFit' }} />
      <Stack.Screen name="Generate" component={GenerateScreen} options={{ title: 'Generate' }} />
      <Stack.Screen name="Approval" component={ApprovalScreen} options={{ title: 'Your plan' }} />
      <Stack.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{ title: 'Workout', headerBackVisible: false, gestureEnabled: false }}
      />
      <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Summary' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Exercises" component={ExercisesScreen} options={{ title: 'Exercises' }} />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: 'Exercise' }}
      />
    </Stack.Navigator>
  );
}
