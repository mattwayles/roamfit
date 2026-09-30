/**
 * The tab shell: Today (Home) and Field Guide (Exercises). JS-only bottom tabs with the custom
 * `TabBar`. Until each screen draws its own header (phases C/F), the tab navigator shows a header
 * so these screens keep their title and top safe-area inset.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import { TabBar } from './TabBar';
import { headerOptions, legacyLightScene } from './screenOptions';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function Tabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ ...headerOptions, ...legacyLightScene, headerShown: true }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'ROAMFIT' }} />
      <Tab.Screen name="Exercises" component={ExercisesScreen} options={{ title: 'FIELD GUIDE' }} />
    </Tab.Navigator>
  );
}
