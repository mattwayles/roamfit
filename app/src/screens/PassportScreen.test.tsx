/**
 * Track 39b - the Passport book screen: pages, paging buttons, the stamp-label deep link, the stamp
 * sheet, the contents jump, the endorsement tap-through, the opt-in, and both themes. The dashboard
 * read is mocked with real page-model inputs (the model itself is covered in passportBook.test.ts).
 */
import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StoreProvider } from '../state/StoreContext';
import { ThemeProvider } from '../state/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';
import { buildBadgeShelf } from '../lib/badges';
import { emptyBadgeFacts } from '../lib/badges.fixtures';
import { buildPassportSummary } from '../lib/dashboard';
import { manyPlaces, sessionAt } from '../lib/passportBook.fixtures';
import { useDashboardData } from '../lib/useDashboardData';
import PassportScreen from './PassportScreen';

jest.mock('../lib/useDashboardData', () => ({ useDashboardData: jest.fn() }));
const mockUseDashboardData = useDashboardData as jest.Mock;

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();
const reload = jest.fn();

function BadgesStub(): React.JSX.Element {
  return <Text testID="badges-stub">badges</Text>;
}

function setData(opts: { enabled?: boolean; sessions?: ReturnType<typeof manyPlaces> } = {}) {
  const enabled = opts.enabled ?? true;
  const sessions = opts.sessions ?? [
    ...manyPlaces(7, 'Portugal', 'PT'),
    sessionAt('2026-03-01', 'Cusco', 'Peru', 'PE'),
  ];
  mockUseDashboardData.mockReturnValue({
    data: {
      user: { passportEnabled: enabled },
      passport: buildPassportSummary(enabled ? sessions : []),
      badges: buildBadgeShelf(
        [],
        emptyBadgeFacts({ passportEnabled: enabled, citiesVisited: 2, countriesVisited: 1 }),
      ),
    },
    reload,
  });
}

function mount(params?: RootStackParamList['Passport'], theme?: 'light' | 'dark') {
  const tree = (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Passport" component={PassportScreen} initialParams={params} />
        <Stack.Screen name="Badges" component={BadgesStub} />
      </Stack.Navigator>
    </NavigationContainer>
  );
  return render(
    <StoreProvider>
      {theme ? <ThemeProvider initialPreference={theme}>{tree}</ThemeProvider> : tree}
    </StoreProvider>,
  );
}

const pageLabel = () => screen.getByTestId('passport-page-label').props.children.join('');

describe('PassportScreen', () => {
  beforeEach(() => {
    reload.mockClear();
    setData();
  });

  it('opens on the cover, titled with a header', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-page-cover')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('PASSPORT')).toBeTruthy();
    expect(screen.getByText('Wanderlift')).toBeTruthy();
    expect(screen.getByText('Passport').props.accessibilityRole).toBe('header');
    expect(pageLabel()).toBe('Page 1 of 6');
  });

  it('next and previous page, and are disabled at the ends', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-page-cover')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('passport-prev').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('passport-next'));
    expect(screen.getByTestId('passport-page-bio')).toBeTruthy();
    expect(pageLabel()).toBe('Page 2 of 6');
    expect(screen.getByText('Training since')).toBeTruthy();
    expect(screen.getByText('Thursday, January 1, 2026')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('passport-prev'));
    expect(screen.getByTestId('passport-page-cover')).toBeTruthy();

    for (let i = 0; i < 5; i += 1) await fireEvent.press(screen.getByTestId('passport-next'));
    expect(screen.getByTestId('passport-page-endorsements')).toBeTruthy();
    expect(pageLabel()).toBe('Page 6 of 6');
    expect(screen.getByTestId('passport-next').props.accessibilityState?.disabled).toBe(true);
  });

  it('opens at the stamp page named by stampLabel', async () => {
    mount({ stampLabel: 'Cusco, PER' });
    await waitFor(() => expect(screen.getByTestId('passport-page-visa-1')).toBeTruthy(), WAIT_OPTS);
    expect(pageLabel()).toBe('Page 5 of 6');
    expect(screen.getByTestId('passport-stamp-Cusco, PER')).toBeTruthy();
  });

  it('an unknown stampLabel falls back to the cover', async () => {
    mount({ stampLabel: 'Nowhere' });
    await waitFor(() => expect(screen.getByTestId('passport-page-cover')).toBeTruthy(), WAIT_OPTS);
  });

  it('shows six stamps with dates per visa page; tapping one opens its detail sheet', async () => {
    mount({ stampLabel: 'City01, PRT' });
    await waitFor(() => expect(screen.getByTestId('passport-page-visa-0')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getAllByTestId(/^passport-stamp-City/)).toHaveLength(6 * 1);
    expect(screen.getByText('Jan 1, 2026')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passport-stamp-City02, PRT'));
    await waitFor(
      () => expect(screen.getByTestId('passport-sheet-sessions')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('passport-sheet-sessions').props.children).toBe('1');
    expect(screen.getByText('First visit')).toBeTruthy();
    expect(screen.getByText('Last visit')).toBeTruthy();
  });

  it('a contents row jumps to that country’s first visa page', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-page-cover')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('passport-next'));
    await fireEvent.press(screen.getByTestId('passport-next'));
    expect(screen.getByTestId('passport-page-contents')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passport-country-Peru'));
    expect(screen.getByTestId('passport-page-visa-1')).toBeTruthy();
    expect(pageLabel()).toBe('Page 5 of 6');
  });

  it('an endorsement opens the Badges screen', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-page-cover')).toBeTruthy(), WAIT_OPTS);
    for (let i = 0; i < 5; i += 1) await fireEvent.press(screen.getByTestId('passport-next'));
    expect(screen.getByText('Three Stops')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('passport-badge-cities_3'));
    await waitFor(() => expect(screen.getByTestId('badges-stub')).toBeTruthy(), WAIT_OPTS);
  });

  it('with Passport off, shows the opt-in instead of the book', async () => {
    setData({ enabled: false });
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-opt-in')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('passport-book')).toBeNull();
    await fireEvent.press(screen.getByTestId('passport-opt-in'));
    expect(reload).toHaveBeenCalled();
  });

  it('with Passport on and no places, shows a gentle empty state', async () => {
    setData({ sessions: [] });
    mount();
    await waitFor(() => expect(screen.getByTestId('passport-empty')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('Passport is on')).toBeTruthy();
    expect(screen.queryByTestId('passport-book')).toBeNull();
  });

  it.each(['dark', 'light'] as const)('renders the book under the %s theme', async (theme) => {
    mount({ stampLabel: 'City01, PRT' }, theme);
    await waitFor(() => expect(screen.getByTestId('passport-page-visa-0')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('passport-book')).toBeTruthy();
  });
});
