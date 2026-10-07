/**
 * The Next Unlock card on Today (DESIGN.md §5.1), from the ADR 0014 side: it names the movement
 * function ("Horizontal Push") and how close you are — never the exercise being unlocked, and not
 * the current one either. Also the In transit tile (`travel-day-button`, moved here from the old
 * calendar header) and the card/strip taps that open Journey.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { signalsRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { getDb } from '../db';
import { midnight, midnightGradients } from '../theme/palettes';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Ack({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant()); // §13.3 gate — not this test's job
  return <>{children}</>;
}

async function mountToday() {
  render(
    <StoreProvider>
      <Ack>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </Ack>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('next-unlock-hero')).toBeTruthy(), WAIT_OPTS);
}

/** Every text node under a test instance, joined. */
function textOf(testID: string): string {
  const texts: string[] = [];
  const walk = (node: { children?: unknown[] }) => {
    for (const child of node.children ?? []) {
      if (typeof child === 'string') texts.push(child);
      else if (child && typeof child === 'object') walk(child as { children?: unknown[] });
    }
  };
  walk(screen.getByTestId(testID) as unknown as { children?: unknown[] });
  return texts.join(' ');
}

describe('Today — Next Unlock card', () => {
  it('headlines the movement family and sessions-to-go, and never names an exercise (ADR 0014)', async () => {
    await mountToday();
    const heroText = textOf('next-unlock-hero');

    // The hero headlines a movement function, and says how close you are.
    const names = familyLibrary.families.map((f) => f.name);
    expect(names.some((n) => heroText.includes(n))).toBe(true);
    expect(heroText).toMatch(/sessions?\s+to\s+your next level/);

    // No exercise anywhere in it — neither the one being unlocked nor the current one — so
    // hiding the reveal on the trail would not be pointless.
    for (const exercise of exerciseLibrary.exercises) {
      expect(heroText).not.toContain(exercise.name);
    }
  });

  it('wears sky, like the Trails it points at: eyebrow and ring gradient', async () => {
    await mountToday();
    const eyebrow = screen.getByText('Next unlock');
    expect(StyleSheet.flatten(eyebrow.props.style).color).toBe(midnight.sky);
    // The ring's gradient as the native SVG layer receives it: [offset, ARGB int, offset, ...].
    type Node = {
      type?: string;
      props?: Record<string, unknown>;
      children?: (Node | string)[] | null;
    };
    const gradientUnder = (n: Node | string, inRing: boolean): number[] | null => {
      if (typeof n === 'string') return null;
      const here = inRing || n.props?.testID === 'next-unlock-ring';
      if (here && n.type === 'RNSVGLinearGradient') return n.props?.gradient as number[];
      for (const c of n.children ?? []) {
        const g = gradientUnder(c, here);
        if (g) return g;
      }
      return null;
    };
    const argb = (hex: string) => 0xff000000 | parseInt(hex.slice(1), 16) | 0;
    const gradient = gradientUnder(screen.toJSON() as Node, false);
    expect(gradient).toEqual([
      0,
      argb(midnightGradients.sky[0]),
      1,
      argb(midnightGradients.sky[1]),
    ]);
  });

  it('opens Journey when tapped', async () => {
    await mountToday();
    await fireEvent.press(screen.getByTestId('next-unlock-hero'));
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('tab-Journey').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});

describe('Today — Next Unlock card → Journey', () => {
  it('scrolls Journey to the Trail card of the family the hero names', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    await mountToday();
    const heroText = textOf('next-unlock-hero');
    await fireEvent.press(screen.getByTestId('next-unlock-hero'));
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);

    const family = familyLibrary.families.find((f) => heroText.includes(f.name));
    const card = await screen.findByTestId(`board-row-${family!.id}`, {}, WAIT_OPTS);
    // Jest has no layout pass: report the offsets the device would (section y 1000, card y 300).
    const layout = (y: number) => ({
      nativeEvent: { layout: { x: 0, y, width: 300, height: 200 } },
    });
    const withLayout = (from: typeof card) => {
      let n = from.parent;
      while (n && typeof n.props.onLayout !== 'function') n = n.parent;
      return n!;
    };
    const wrapper = withLayout(card); // the per-card onLayout wrapper
    const section = withLayout(wrapper); // the Trails section
    await fireEvent(section, 'layout', layout(1000));
    await fireEvent(wrapper, 'layout', layout(300));

    await waitFor(() => expect(scrollTo).toHaveBeenCalled(), WAIT_OPTS);
    expect(scrollTo.mock.calls[0][0]).toMatchObject({ y: expect.any(Number) });
    expect((scrollTo.mock.calls[0][0] as { y: number }).y).toBeGreaterThan(1000);
    scrollTo.mockRestore();
  });
});

describe('Today — In transit tile', () => {
  it('records a travel day for local today and says so', async () => {
    await mountToday();
    const today = nowEngineClock().today;
    await fireEvent.press(screen.getByTestId('travel-day-button'));
    await waitFor(
      () =>
        expect(
          signalsRepo
            .getSignalEventsByType(getDb(), 'travel_day')
            .some((e) => e.localDate === today),
        ).toBe(true),
      WAIT_OPTS,
    );
    // Invariant 6: the marker is keyed by the local calendar date, and the tile confirms it.
    await waitFor(() => expect(textOf('travel-day-button')).toContain('Safe travels'), WAIT_OPTS);
  });
});
