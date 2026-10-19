/**
 * Track 39c - the Passport page turn: buttons, input lock, jumps, Reduce Motion / VoiceOver swaps,
 * the accessibility actions, the swipe (PanResponder handlers driven by hand) and its pure
 * decision logic. Same mocked dashboard read as PassportScreen.test.tsx.
 */
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StoreProvider } from '../state/StoreContext';
import type { RootStackParamList } from '../navigation/types';
import { buildBadgeShelf } from '../lib/badges';
import { emptyBadgeFacts } from '../lib/badges.fixtures';
import { buildPassportSummary } from '../lib/dashboard';
import { manyPlaces, sessionAt } from '../lib/passportBook.fixtures';
import { useDashboardData } from '../lib/useDashboardData';
import { claimsSwipe, decideSwipe, rubberBand } from '../components/PageTurnBook';
import PassportScreen from './PassportScreen';

jest.mock('../lib/useDashboardData', () => ({ useDashboardData: jest.fn() }));
const mockUseDashboardData = useDashboardData as jest.Mock;

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

function setData() {
  const sessions = [
    ...manyPlaces(7, 'Portugal', 'PT'),
    sessionAt('2026-03-01', 'Cusco', 'Peru', 'PE'),
  ];
  mockUseDashboardData.mockReturnValue({
    data: {
      user: { passportEnabled: true },
      passport: buildPassportSummary(sessions),
      badges: buildBadgeShelf(
        [],
        emptyBadgeFacts({ passportEnabled: true, citiesVisited: 2, countriesVisited: 1 }),
      ),
    },
    reload: jest.fn(),
  });
}

function mount(params?: RootStackParamList['Passport']) {
  return render(
    <StoreProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Passport" component={PassportScreen} initialParams={params} />
        </Stack.Navigator>
      </NavigationContainer>
    </StoreProvider>,
  );
}

const pageLabel = () => screen.getByTestId('passport-page-label').props.children.join('');
const turning = () => screen.queryByTestId('passport-turn', { includeHiddenElements: true });
/**
 * `Animated.timing` is held open (real timers stay on for the SQLite-backed mount): a turn stays
 * "running" until `settle()` finishes every pending animation the way the clock would.
 */
let pending: Array<() => void> = [];
const settle = async () => {
  await act(async () => {
    pending.splice(0).forEach((finish) => finish());
  });
  expect(turning()).toBeNull();
};
const ready = async () => {
  await waitFor(() => expect(screen.getByTestId('passport-book')).toBeTruthy(), WAIT_OPTS);
  await act(async () => {}); // let the accessibility-setting reads land
};

/**
 * Drives the book's PanResponder handlers the way the responder system does: capture (which folds
 * the first sample into the gesture state), should-set, grant (which zeroes dx), then a move and a
 * release. `lastMoveMs` is how long the final move took, so it sets the release velocity.
 */
async function swipe(dx: number, lastMoveMs = 2000, dy = 0) {
  const p = screen.getByTestId('passport-book').props;
  const ev = (x: number, y: number, t: number, px: number, py: number) => ({
    nativeEvent: { touches: [{}] },
    touchHistory: {
      touchBank: [
        {
          touchActive: true,
          startPageX: 100,
          startPageY: 100,
          startTimeStamp: 0,
          currentPageX: x,
          currentPageY: y,
          currentTimeStamp: t,
          previousPageX: px,
          previousPageY: py,
          previousTimeStamp: t - 16,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
    },
  });
  const x1 = 100 + dx * 0.4;
  const y1 = 100 + dy * 0.4;
  p.onStartShouldSetResponderCapture(ev(100, 100, 1, 100, 100));
  const first = ev(x1, y1, 16, 100, 100);
  p.onMoveShouldSetResponderCapture(first);
  if (!p.onMoveShouldSetResponder(first)) return false;
  await act(async () => {
    p.onResponderGrant(first);
    p.onResponderMove(ev(100 + dx, 100 + dy, 16 + lastMoveMs, x1, y1));
  });
  await act(async () => {
    p.onResponderRelease(ev(100 + dx, 100 + dy, 17 + lastMoveMs, 100 + dx, 100 + dy));
  });
  return true;
}

describe('PassportScreen page turn', () => {
  beforeEach(() => {
    pending = [];
    jest.spyOn(Animated, 'timing').mockImplementation(((
      value: Animated.Value,
      config: Animated.TimingAnimationConfig,
    ) => ({
      start: (cb?: Animated.EndCallback) => {
        pending.push(() => {
          value.setValue(config.toValue as number);
          cb?.({ finished: true });
        });
      },
      stop: () => {},
      reset: () => {},
    })) as unknown as typeof Animated.timing);
    setData();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('next then previous animates a turn and lands on the right pages', async () => {
    mount();
    await ready();
    await fireEvent.press(screen.getByTestId('passport-next'));
    expect(turning()).toBeTruthy();
    expect(pageLabel()).toBe('Page 2 of 6'); // committed at the start
    expect(screen.getByTestId('passport-page-bio')).toBeTruthy(); // the visible page; the cover is the hidden overlay
    await settle();
    expect(screen.getByTestId('passport-page-bio')).toBeTruthy();
    expect(screen.queryByTestId('passport-page-cover')).toBeNull();

    await fireEvent.press(screen.getByTestId('passport-prev'));
    expect(turning()).toBeTruthy();
    expect(screen.getByTestId('passport-page-cover')).toBeTruthy(); // the page turning back in
    await settle();
    expect(pageLabel()).toBe('Page 1 of 6');
    expect(screen.getByTestId('passport-page-cover')).toBeTruthy();
    expect(screen.queryByTestId('passport-page-bio')).toBeNull();
  });

  it('ignores input while a turn is running', async () => {
    mount();
    await ready();
    await fireEvent.press(screen.getByTestId('passport-next'));
    await fireEvent.press(screen.getByTestId('passport-next'));
    await fireEvent.press(screen.getByTestId('passport-next'));
    await settle();
    expect(pageLabel()).toBe('Page 2 of 6');
  });

  it('a contents jump is one turn straight to the target', async () => {
    mount();
    await ready();
    await fireEvent.press(screen.getByTestId('passport-next'));
    await settle();
    await fireEvent.press(screen.getByTestId('passport-next'));
    await settle();
    await fireEvent.press(screen.getByTestId('passport-country-Peru'));
    expect(pageLabel()).toBe('Page 5 of 6');
    expect(screen.getByTestId('passport-page-visa-1')).toBeTruthy();
    await settle();
    expect(screen.queryByTestId('passport-page-contents')).toBeNull();
  });

  it('the stampLabel open lands immediately, with no turn', async () => {
    mount({ stampLabel: 'Cusco, PER' });
    await waitFor(() => expect(screen.getByTestId('passport-page-visa-1')).toBeTruthy(), WAIT_OPTS);
    expect(turning()).toBeNull();
    expect(pageLabel()).toBe('Page 5 of 6');
  });

  it('with Reduce Motion on, the page swaps with no turn', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    mount();
    await ready();
    await fireEvent.press(screen.getByTestId('passport-next'));
    expect(turning()).toBeNull();
    expect(screen.getByTestId('passport-page-bio')).toBeTruthy();
    expect(pageLabel()).toBe('Page 2 of 6');
    await fireEvent.press(screen.getByTestId('passport-prev'));
    expect(screen.getByTestId('passport-page-cover')).toBeTruthy();
  });

  it('with a screen reader running, the page swaps with no turn', async () => {
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
    mount();
    await ready();
    await fireEvent.press(screen.getByTestId('passport-next'));
    expect(turning()).toBeNull();
    expect(pageLabel()).toBe('Page 2 of 6');
  });

  it('the increment / decrement accessibility actions change the page', async () => {
    mount();
    await ready();
    const label = () => screen.getByTestId('passport-page-label');
    expect(label().props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'increment',
      'decrement',
    ]);
    await fireEvent(label(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await settle();
    expect(pageLabel()).toBe('Page 2 of 6');
    await fireEvent(label(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await settle();
    expect(pageLabel()).toBe('Page 1 of 6');
    // Past the first page does nothing.
    await fireEvent(label(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(pageLabel()).toBe('Page 1 of 6');
  });

  it('a leftward swipe turns forward; a rightward swipe turns back', async () => {
    mount();
    await ready();
    expect(await swipe(-250)).toBe(true);
    await settle();
    expect(pageLabel()).toBe('Page 2 of 6');
    expect(screen.getByTestId('passport-page-bio')).toBeTruthy();
    expect(await swipe(250)).toBe(true);
    await settle();
    expect(pageLabel()).toBe('Page 1 of 6');
  });

  it('a short, slow swipe falls back; a fling turns', async () => {
    mount();
    await ready();
    await swipe(-40);
    await settle();
    expect(pageLabel()).toBe('Page 1 of 6');
    await swipe(-40, 16);
    await settle();
    expect(pageLabel()).toBe('Page 2 of 6');
  });

  it('swiping past the first page does not turn', async () => {
    mount();
    await ready();
    await swipe(250);
    expect(turning()).toBeNull();
    expect(pageLabel()).toBe('Page 1 of 6');
  });

  it('a vertical or tiny move is not claimed, so taps and scrolling are untouched', async () => {
    mount();
    await ready();
    expect(await swipe(5)).toBe(false);
    expect(await swipe(30, 2000, 80)).toBe(false);
  });

  it('with Reduce Motion on, a swipe just swaps', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    mount();
    await ready();
    await swipe(-250);
    expect(turning()).toBeNull();
    expect(pageLabel()).toBe('Page 2 of 6');
  });
});

describe('swipe decision logic', () => {
  const base = { vx: 0, width: 300, canNext: true, canPrev: true };
  it('claims only clearly horizontal moves', () => {
    expect(claimsSwipe(11, 0)).toBe(true);
    expect(claimsSwipe(-30, 10)).toBe(true);
    expect(claimsSwipe(9, 0)).toBe(false);
    expect(claimsSwipe(20, 25)).toBe(false);
  });
  it('turns past the distance threshold, by direction', () => {
    expect(decideSwipe({ ...base, dx: -120 })).toBe('next');
    expect(decideSwipe({ ...base, dx: 120 })).toBe('prev');
    expect(decideSwipe({ ...base, dx: -40 })).toBe('cancel');
  });
  it('turns on a fling in the drag direction only', () => {
    expect(decideSwipe({ ...base, dx: -30, vx: -0.8 })).toBe('next');
    expect(decideSwipe({ ...base, dx: -30, vx: 0.8 })).toBe('cancel');
  });
  it('bounces at the first and last page', () => {
    expect(decideSwipe({ ...base, dx: 200, canPrev: false })).toBe('bounce');
    expect(decideSwipe({ ...base, dx: -200, canNext: false })).toBe('bounce');
    expect(decideSwipe({ ...base, dx: -20, canNext: false })).toBe('bounce');
  });
  it('rubber-bands with resistance and a cap', () => {
    expect(rubberBand(-50)).toBe(-15);
    expect(rubberBand(500)).toBe(28);
  });
});
