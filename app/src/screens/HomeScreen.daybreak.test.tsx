/** Home under the Daybreak theme: real Daybreak values, and the hero pill stays legible. */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { sessionsRepo, usersRepo } from '@roamfit/store';
import { daybreak } from '../theme';
import { inDaybreak } from '../ui/test-utils';

function Cleanup({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString());
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  return <>{children}</>;
}

describe('Home in Daybreak', () => {
  it('uses paper tiles and a teal legend on the white hero pill', async () => {
    render(
      inDaybreak(
        <StoreProvider>
          <Cleanup>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </Cleanup>
        </StoreProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), {
      timeout: 5000,
      interval: 50,
    });
    const tile = StyleSheet.flatten(screen.getByTestId('quick-session-button').props.style);
    expect(tile.backgroundColor).toBe(daybreak.surface);
    expect(tile.borderColor).toBe(daybreak.line);
    const cta = StyleSheet.flatten(screen.getByText('Build a session').props.style);
    expect(cta.color).toBe(daybreak.teal);
    expect(daybreak.ink).toBe('#FFFFFF');
  });
});
