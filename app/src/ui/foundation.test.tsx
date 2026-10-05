import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import {
  daybreak,
  daybreakTheme,
  lineWidth,
  numeralMaxFontScale,
  type,
  midnight,
} from '../theme';
import {
  Button,
  Gradient,
  Icon,
  PressableScale,
  Txt,
  gradientPoints,
  iconMap,
  useReduceMotion,
} from './index';
import { inDaybreak, ready, WAIT } from './test-utils';

describe('Txt', () => {
  it('applies the variant style and token color', async () => {
    await render(
      <Txt variant="h1" color="teal" testID="t">
        Hello
      </Txt>,
    );
    await ready('t');
    const s = StyleSheet.flatten(screen.getByTestId('t').props.style);
    expect(s.fontFamily).toBe(type.h1.fontFamily);
    expect(s.fontSize).toBe(30);
    expect(s.textTransform).toBe('uppercase');
    expect(s.color).toBe(midnight.teal);
  });

  it('defaults to body/text, and `upper` overrides the variant', async () => {
    await render(
      <>
        <Txt testID="a">a</Txt>
        <Txt variant="display" upper={false} testID="b">
          b
        </Txt>
      </>,
    );
    await ready('a');
    expect(StyleSheet.flatten(screen.getByTestId('a').props.style).color).toBe(midnight.text);
    expect(StyleSheet.flatten(screen.getByTestId('b').props.style).textTransform).toBe('none');
  });

  describe('adjustsFontSizeToFit (fitted in JS, not natively)', () => {
    const layout = (testID: string, width: number) =>
      fireEvent(screen.getByTestId(testID), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 64 } },
      });
    const fitted = (value: string, testID = 'n') => (
      <Txt variant="hero" numberOfLines={1} adjustsFontSizeToFit testID={testID}>
        {value}
      </Txt>
    );

    it('never hands the shrink to the native Text (it ignores minimumFontScale on iOS)', async () => {
      await render(fitted('1240'));
      await ready('n');
      expect(screen.getByTestId('n').props.adjustsFontSizeToFit).toBeFalsy();
      expect(screen.getByTestId('n').props.minimumFontScale).toBeUndefined();
    });

    it('shrinks clipped text to fit, floored at minimumFontScale, line height in step', async () => {
      await render(fitted('1240'));
      await ready('n');
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBe(64);
      await layout('n', 88);
      const s = StyleSheet.flatten(screen.getByTestId('n').props.style);
      expect(s.fontSize).toBeLessThan(64);
      expect(s.fontSize).toBeGreaterThanOrEqual(32);
      expect(s.lineHeight).toBeCloseTo(s.fontSize as number, 5);
    });

    it('floors at 50% by default, never the native 4pt', async () => {
      await render(fitted('123456789'));
      await ready('n');
      await layout('n', 20);
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBe(32);
    });

    it('a stretched text refits when its value grows, with no new layout event', async () => {
      const r = await render(fitted('3'));
      await ready('n');
      await layout('n', 88); // wider than "3": stretched, so 88 is the room
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBe(64);
      await r.rerender(fitted('12345'));
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBeLessThan(64);
      await r.rerender(fitted('7'));
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBe(64);
    });

    it('text that fits its own width stays full size', async () => {
      await render(fitted('12'));
      await ready('n');
      // Exactly the content width: neither clipped nor stretched. (Jest's window fontScale is 2,
      // which the numeral cap holds to 1.3, the same scale the component measures with.)
      const content = lineWidth(
        {
          text: '12',
          fontFamily: type.hero.fontFamily,
          fontSize: 64,
          tabular: true,
          fontScale: numeralMaxFontScale,
        },
        64,
      )!;
      await layout('n', content);
      expect(StyleSheet.flatten(screen.getByTestId('n').props.style).fontSize).toBe(64);
    });

    it('nested elements keep the native behavior', async () => {
      await render(
        <Txt
          variant="hero"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          testID="n"
        >
          1<Txt>2</Txt>
        </Txt>,
      );
      await ready('n');
      expect(screen.getByTestId('n').props.adjustsFontSizeToFit).toBe(true);
      expect(screen.getByTestId('n').props.minimumFontScale).toBe(0.6);
    });
  });

  it('caps Dynamic Type on the big numerals only', async () => {
    await render(
      <>
        <Txt variant="mega" testID="m">
          12
        </Txt>
        <Txt variant="body" testID="b">
          x
        </Txt>
      </>,
    );
    await ready('m');
    expect(screen.getByTestId('m').props.maxFontSizeMultiplier).toBe(1.3);
    expect(screen.getByTestId('b').props.maxFontSizeMultiplier).toBeUndefined();
  });
});

describe('Icon', () => {
  it('maps the semantic name to the Ionicons glyph and is hidden from VoiceOver by default', async () => {
    await render(<Icon name="bolt" testID="i" />);
    // Decorative icons are (deliberately) excluded from default queries.
    expect(screen.queryByTestId('i')).toBeNull();
    const props = screen.getByTestId('i', { hidden: true }).props;
    expect(props.name).toBe(iconMap.bolt);
    expect(props.accessibilityElementsHidden).toBe(true);
  });

  it('is exposed when it carries a label', async () => {
    await render(<Icon name="flag" accessibilityLabel="Summit" testID="i" />);
    expect(screen.getByLabelText('Summit')).toBeTruthy();
  });
});

describe('Gradient', () => {
  it('turns a CSS angle into a unit-box vector', () => {
    expect(gradientPoints(180)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 });
    expect(gradientPoints(90)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
    const d = gradientPoints(135);
    expect(d.x1).toBeCloseTo(0.146, 2);
    expect(d.y2).toBeCloseTo(0.854, 2);
  });

  it('renders one Stop per color', async () => {
    await render(<Gradient colors={['#111111', '#222222', '#333333']} testID="g" />);
    await ready('g');
    // Nothing is drawn until the fill has a real size (see `useLayoutSize`).
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/RNSVGLinearGradient/);
    await fireEvent(screen.getByTestId('g'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 64 } },
    });
    expect(JSON.stringify(screen.toJSON()).match(/RNSVGLinearGradient/g)).toHaveLength(1);
  });
});

describe('useReduceMotion', () => {
  it('reflects the OS setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true), WAIT);
    jest.restoreAllMocks();
  });

  it('is false by default', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled(), WAIT);
    expect(result.current).toBe(false);
    jest.restoreAllMocks();
  });
});

describe('PressableScale', () => {
  it('presses and fires the selection haptic; haptic={false} stays silent', async () => {
    const tick = jest.spyOn(Haptics, 'selectionAsync');
    const onPress = jest.fn();
    await render(
      <>
        <PressableScale testID="a" onPress={onPress}>
          <Txt>a</Txt>
        </PressableScale>
        <PressableScale testID="b" onPress={onPress} haptic={false}>
          <Txt>b</Txt>
        </PressableScale>
      </>,
    );
    await ready('a');
    await fireEvent.press(screen.getByTestId('a'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(tick).toHaveBeenCalledTimes(1);
    tick.mockRestore();
  });

  it('does not press when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale testID="a" disabled onPress={onPress}>
        <Txt>a</Txt>
      </PressableScale>,
    );
    await ready('a');
    await fireEvent.press(screen.getByTestId('a'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Button', () => {
  it('renders its label and presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Build my session" onPress={onPress} testID="b" />);
    await ready('b');
    expect(screen.getByText('Build my session')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('primary is a 64pt gradient pill at lg; secondary has no gradient', async () => {
    await render(
      <>
        <Button label="Go" testID="p" />
        <Button label="Later" variant="secondary" size="md" testID="s" />
      </>,
    );
    await ready('p');
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style).height).toBe(64);
    expect(StyleSheet.flatten(screen.getByTestId('s').props.style).height).toBe(52);
    expect(screen.getAllByTestId('gradient')).toHaveLength(1);
  });

  it('loading and disabled swallow presses', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="A" loading onPress={onPress} testID="a" />
        <Button label="B" disabled onPress={onPress} testID="b" />
      </>,
    );
    await ready('a');
    await fireEvent.press(screen.getByTestId('a'));
    await fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows its icon', async () => {
    await render(<Button label="Go" icon="bolt" testID="b" />);
    await ready('b');
    expect(JSON.stringify(screen.toJSON())).toContain(`"name":"${iconMap.bolt}"`);
  });
});

describe('Daybreak (foundation)', () => {
  it('Txt defaults to Daybreak ink and resolves tokens through the theme', async () => {
    await render(
      inDaybreak(
        <>
          <Txt testID="a">a</Txt>
          <Txt color="teal" testID="b">
            b
          </Txt>
          <Txt color="ink" testID="c">
            c
          </Txt>
        </>,
      ),
    );
    await ready('a');
    const color = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).color;
    expect(color('a')).toBe(daybreak.text);
    expect(color('b')).toBe(daybreak.teal);
    expect(color('c')).toBe('#FFFFFF');
  });

  it('Icon takes its color from the Daybreak palette', async () => {
    await render(inDaybreak(<Icon name="bolt" color="gold" testID="i" />));
    expect(StyleSheet.flatten(screen.getByTestId('i', { hidden: true }).props.style).color).toBe(
      daybreak.gold,
    );
  });

  it('primary Button gets the tamed Daybreak glow and white-on-deep-teal legend', async () => {
    await render(inDaybreak(<Button label="Go" testID="p" />));
    await ready('p');
    expect(StyleSheet.flatten(screen.getByTestId('p').props.style)).toMatchObject(
      daybreakTheme.glow(daybreak.teal),
    );
    expect(StyleSheet.flatten(screen.getByText('Go').props.style).color).toBe('#FFFFFF');
  });

  it('Gradient with no colors uses the Daybreak trail', async () => {
    await render(inDaybreak(<Gradient testID="g" />));
    await ready('g');
    await fireEvent(screen.getByTestId('g'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 64 } },
    });
    const json = JSON.stringify(screen.toJSON()).toLowerCase();
    expect(json).toMatch(/linearGradient/i);
    expect(json).not.toContain('40bd6e');
  });
});
