/**
 * Track 44c - the first-view reveal on the Badges page: unseen badges stitch in, ONE success
 * haptic plays for the whole reveal, and opening an earned summit badge lands with a stronger
 * impact. Motion itself cannot be seen in Jest; this pins the wiring. Its own file so the render
 * environment starts clean.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { BADGES } from '@roamfit/engine';
import { badgesRepo } from '@roamfit/store';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import type { RootStackParamList } from '../navigation/types';
import BadgesScreen from './BadgesScreen';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

describe('BadgesScreen reveal', () => {
  it('stitches unseen badges in with one success haptic, and opens a summit badge harder', async () => {
    const summit = BADGES.filter((b) => b.series === 'sessions' && b.tier === 'summit')[0]!;
    badgesRepo.insertEarnedBadges(
      getDb(),
      [{ badgeId: summit.id, localDate: '2026-10-02', sessionId: null, retroactive: true }],
      '2026-10-02T12:00:00.000Z',
    );
    const notify = jest.spyOn(Haptics, 'notificationAsync');
    const impact = jest.spyOn(Haptics, 'impactAsync');

    await render(
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Badges" component={BadgesScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('badges-hero-featured')).toBeTruthy(), WAIT_OPTS);
    // The unseen hero emblem is wrapped in the stitch-in animation.
    expect(screen.getByTestId('badges-hero-emblem-stitch')).toBeTruthy();
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1), WAIT_OPTS);
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);

    await fireEvent.press(screen.getByTestId('badges-hero-featured'));
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
