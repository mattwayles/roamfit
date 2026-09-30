/**
 * The tab shell: Today (Home), Journey and Field Guide (Exercises). JS-only bottom tabs with the
 * custom `TabBar`. Today and Journey are migrated (own header, `bg` scene); Field Guide still
 * shows the tab navigator's header until phase F draws its own.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import JourneyScreen from '../screens/JourneyScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import { TabBar } from './TabBar';
import { headerOptions, legacyLightScene } from './screenOptions';
import { colors } from '../theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function Tabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ ...headerOptions, ...legacyLightScene, headerShown: true }}
    >
      {/* Today and Journey are migrated: each draws its own header and sits on `bg`, overriding
          the legacy light scene the not-yet-migrated tab (Field Guide) still inherits. */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      />
      <Tab.Screen
        name="Journey"
        component={JourneyScreen}
        options={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      />
      <Tab.Screen name="Exercises" component={ExercisesScreen} options={{ title: 'FIELD GUIDE' }} />
    </Tab.Navigator>
  );
}
