/**
 * Settings, reached the way a user reaches it: the gear on Today, through the real navigator and
 * the real on-device store. What matters here is that every boolean is a design-system `Switch`
 * row whose press really patches the user record, that the groups sit in the documented order
 * (DESIGN.md §5.10), that the motivation times keep their -/+/remove/add behavior, and that the
 * reset confirm is a `Sheet` whose safe choice does nothing.
 *
 * The `toggle-*` id is on the row itself (tap anywhere); its `accessibilityState.checked` is the
 * value. There is no native `Switch` to fire `valueChange` at any more.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { progressionStateRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { ThemeProvider } from '../state/ThemeProvider';
import { getDb } from '../db';
import { nowUtcInstant } from '../lib/localClock';
import { daylight, goldenHourTheme } from '../theme';
import { DISCLAIMER_TEXT } from './SettingsScreen';
import { WAIT, flat, ready } from '../ui/test-utils';

beforeAll(() => {
  usersRepo.acknowledgeDisclaimer(getDb(), nowUtcInstant()); // §13.3 gate — not this test's subject
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openSettings() {
  await render(
    <StoreProvider>
      <ThemeProvider>
        <NavigationContainer theme={goldenHourTheme.navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </StoreProvider>,
  );
  await ready('open-settings');
  await fireEvent.press(screen.getByTestId('open-settings'));
  await ready('settings-screen');
}

const checked = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState.checked as boolean;

describe('appearance', () => {
  const selected = (id: string) =>
    screen.getByTestId(id).props.accessibilityState.selected as boolean;

  beforeEach(() => {
    usersRepo.updateUser(getDb(), { themePreference: 'system' }, nowUtcInstant());
  });

  it('shows the stored preference as the selected option, with the caption', async () => {
    usersRepo.updateUser(getDb(), { themePreference: 'light' }, nowUtcInstant());
    await openSettings();
    expect(selected('appearance-light')).toBe(true);
    expect(selected('appearance-system')).toBe(false);
    expect(selected('appearance-dark')).toBe(false);
    expect(screen.getByText(/^Daylight is built for training outdoors in full sun\./)).toBeTruthy();
  });

  it('pressing an option persists it and switches the live theme', async () => {
    await openSettings();
    expect(selected('appearance-system')).toBe(true);
    await fireEvent.press(screen.getByTestId('appearance-light'));
    await waitFor(() => expect(flat('settings-screen').backgroundColor).toBe(daylight.bg), WAIT);
    expect(usersRepo.getUser(getDb())!.themePreference).toBe('light');
    expect(selected('appearance-light')).toBe(true);
    expect(selected('appearance-system')).toBe(false);

    await fireEvent.press(screen.getByTestId('appearance-dark'));
    await waitFor(
      () => expect(flat('settings-screen').backgroundColor).toBe(goldenHourTheme.colors.bg),
      WAIT,
    );
    expect(usersRepo.getUser(getDb())!.themePreference).toBe('dark');
  });
});

describe('settings', () => {
  it('lays the groups out in order: Appearance, Training, Motivation, Travel & privacy, Apple Health, disclaimer, Advanced', async () => {
    await openSettings();
    const order = screen
      .getAllByTestId(/^settings-section-/)
      .map((node) => (node.props.testID as string).replace('settings-section-', ''));
    expect(order).toEqual([
      'Appearance',
      'Training',
      'Motivation',
      'Travel & privacy',
      'Apple Health',
      'Medical disclaimer',
      'Advanced',
    ]);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTestId('disclaimer-text')).toHaveTextContent(DISCLAIMER_TEXT);
  });

  it.each([
    ['toggle-cue-sounds', (u: usersRepo.UserRecord) => u.cueSoundsEnabled],
    ['toggle-passport', (u: usersRepo.UserRecord) => u.passportEnabled],
    ['toggle-healthkit-write', (u: usersRepo.UserRecord) => u.healthWriteEnabled],
    [
      'toggle-quiet-hours',
      (u: usersRepo.UserRecord) => u.notificationPrefs.quietHoursEnabled ?? true,
    ],
    [
      'toggle-motivation',
      (u: usersRepo.UserRecord) => u.notificationPrefs.motivationEnabled ?? true,
    ],
  ])('%s flips its value in the user record, from the row or its switch', async (id, read) => {
    await openSettings();
    const stored = () => read(usersRepo.getUser(getDb())!);

    const before = stored();
    expect(checked(id)).toBe(before);

    await fireEvent.press(screen.getByTestId(id));
    await waitFor(() => expect(stored()).toBe(!before));
    expect(checked(id)).toBe(!before);

    // The switch inside the row is the same control (hidden from VoiceOver, so query it as such).
    await fireEvent.press(screen.getByTestId(`${id}-switch`, { hidden: true }));
    await waitFor(() => expect(stored()).toBe(before));
    expect(checked(id)).toBe(before);
  });

  it('steps a motivation time by 15 minutes, adds up to the cap and removes down to one', async () => {
    usersRepo.updateUser(
      getDb(),
      { notificationPrefs: { motivationEnabled: true, motivationTimes: ['18:00'] } },
      nowUtcInstant(),
    );
    await openSettings();
    const value = (i: number) => screen.getByTestId(`motivation-time-${i}-value`);

    expect(value(0)).toHaveTextContent('18:00');
    // The only time can't be removed: the master toggle is what turns the feature off.
    expect(screen.queryByTestId('motivation-time-0-remove')).toBeNull();

    await fireEvent.press(screen.getByTestId('motivation-time-0-plus'));
    await waitFor(() => expect(value(0)).toHaveTextContent('18:15'));
    await fireEvent.press(screen.getByTestId('motivation-time-0-minus'));
    await fireEvent.press(screen.getByTestId('motivation-time-0-minus'));
    await waitFor(() => expect(value(0)).toHaveTextContent('17:45'));
    expect(usersRepo.getUser(getDb())!.notificationPrefs.motivationTimes).toEqual(['17:45']);

    await fireEvent.press(screen.getByTestId('motivation-time-add'));
    await waitFor(() => expect(screen.getByTestId('motivation-time-row-1')).toBeTruthy());
    expect(screen.getByTestId('motivation-time-add')).toHaveTextContent(/2\/5/);
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(screen.getByTestId('motivation-time-add'));
    }
    await waitFor(() => expect(screen.getByTestId('motivation-time-row-4')).toBeTruthy());
    expect(screen.queryByTestId('motivation-time-add')).toBeNull();

    await fireEvent.press(screen.getByTestId('motivation-time-0-remove'));
    await waitFor(() => expect(screen.queryByTestId('motivation-time-row-4')).toBeNull());
    expect(usersRepo.getUser(getDb())!.notificationPrefs.motivationTimes).toHaveLength(4);
    expect(screen.getByTestId('motivation-time-add')).toBeTruthy();
  });

  it('hides the motivation times while daily motivation is off', async () => {
    usersRepo.updateUser(
      getDb(),
      { notificationPrefs: { motivationEnabled: true } },
      nowUtcInstant(),
    );
    await openSettings();
    expect(screen.getByTestId('motivation-times')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('toggle-motivation'));
    await waitFor(() => expect(screen.queryByTestId('motivation-times')).toBeNull());
  });

  it('keeps diagnostics and reset behind the Advanced disclosure', async () => {
    await openSettings();
    expect(screen.queryByTestId('load-diagnostics')).toBeNull();
    expect(screen.queryByTestId('reset-progression-sessions')).toBeNull();

    await fireEvent.press(screen.getByTestId('settings-advanced-toggle'));
    await waitFor(() => expect(screen.getByTestId('load-diagnostics')).toBeTruthy());
    expect(screen.getByTestId('settings-advanced-toggle').props.accessibilityState.expanded).toBe(
      true,
    );
    expect(screen.queryByTestId('diagnostics-lines')).toBeNull();

    await fireEvent.press(screen.getByTestId('load-diagnostics'));
    await waitFor(() => expect(screen.getByTestId('diagnostics-lines')).toBeTruthy());
    expect(screen.getByTestId('diagnostics-lines')).toHaveTextContent(/Generated \d+ \/ started/);
  });

  it('confirms a reset in a Sheet whose loud, primary choice is to keep going', async () => {
    const reset = jest
      .spyOn(progressionStateRepo, 'resetAllProgressionSessions')
      .mockImplementation(() => undefined as never);
    await openSettings();
    await fireEvent.press(screen.getByTestId('settings-advanced-toggle'));
    await waitFor(() => expect(screen.getByTestId('reset-progression-sessions')).toBeTruthy());

    // Nothing happens on the first tap but the question.
    await fireEvent.press(screen.getByTestId('reset-progression-sessions'));
    await waitFor(() => expect(screen.getByTestId('reset-sheet')).toBeTruthy());
    expect(screen.getByText('Reset progression ladders?')).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();

    // Keep going: closes without resetting.
    await fireEvent.press(screen.getByTestId('reset-confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('reset-sheet')).toBeNull(), WAIT);
    expect(reset).not.toHaveBeenCalled();

    // Reset: does it, then closes.
    await fireEvent.press(screen.getByTestId('reset-progression-sessions'));
    await waitFor(() => expect(screen.getByTestId('reset-confirm-yes')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reset-confirm-yes'));
    expect(reset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('reset-sheet')).toBeNull(), WAIT);
  });
});
