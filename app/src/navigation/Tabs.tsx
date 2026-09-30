/**
 * The tab shell: Today (Home), Journey and Field Guide (Exercises). JS-only bottom tabs with the
 * custom `TabBar`. Every tab draws its own header (`<Screen edges top/left/right>`), so the tab
 * navigator's header is off and the scene is `bg`.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import JourneyScreen from '../screens/JourneyScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import { TabBar } from './TabBar';
import { headerOptions } from './screenOptions';
import { colors } from '../theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export default function Tabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        ...headerOptions,
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Journey" component={JourneyScreen} />
      <Tab.Screen name="Exercises" component={ExercisesScreen} />
    </Tab.Navigator>
  );
}
