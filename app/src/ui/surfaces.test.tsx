import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { colors, gradients } from '../theme';
import {
  Card,
  ProgressRing,
  Stamp,
  StatTile,
  TopoPattern,
  Txt,
  stampSpec,
  topoLoops,
} from './index';
import { flat, ready } from './test-utils';

describe('Card', () => {
  it('plain is a surface with a 1px line border', async () => {
    await render(
      <Card testID="c">
        <Txt>hi</Txt>
      </Card>,
    );
    await ready('c');
    const s = flat('c');
    expect(s.backgroundColor).toBe(colors.surface);
    expect(s.borderColor).toBe(colors.line);
    expect(s.borderWidth).toBe(1);
  });

  it('hero renders a gradient and a seeded topo pattern; plain renders neither', async () => {
    await render(
      <>
        <Card variant="hero" seed="hero" testID="h">
          <Txt>h</Txt>
        </Card>
        <Card testID="p">
          <Txt>p</Txt>
        </Card>
      </>,
    );
    await ready('h');
    expect(screen.getAllByTestId('gradient')).toHaveLength(1);
    expect(screen.getAllByTestId('topo-pattern')).toHaveLength(1);
  });

  it('accent wraps the body in a gradient border', async () => {
    await render(
      <Card variant="accent" tone="lagoon" testID="a">
        <Txt>a</Txt>
      </Card>,
    );
    await ready('a');
    expect(screen.getAllByTestId('gradient')).toHaveLength(1);
    expect(flat('a').padding).toBe(2);
  });

  it('is pressable when given onPress', async () => {
    const onPress = jest.fn();
    await render(
      <Card testID="c" onPress={onPress}>
        <Txt>x</Txt>
      </Card>,
    );
    await ready('c');
    await fireEvent.press(screen.getByTestId('c'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TopoPattern', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(topoLoops('lisbon')).toEqual(topoLoops('lisbon'));
    expect(topoLoops('lisbon').paths).not.toEqual(topoLoops('tokyo').paths);
  });

  it('draws 5-7 closed loops at 6-9% opacity', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { paths, opacity } = topoLoops(seed);
      expect(paths.length).toBeGreaterThanOrEqual(5);
      expect(paths.length).toBeLessThanOrEqual(7);
      expect(opacity).toBeGreaterThanOrEqual(0.06);
      expect(opacity).toBeLessThanOrEqual(0.09);
      for (const d of paths) expect(d).toMatch(/^M[\d.,-]+(C[\d.,\s-]+)+Z$/);
    }
  });

  it('renders one path per loop with the same path data every time', async () => {
    const { paths } = topoLoops('lisbon');
    await render(<TopoPattern seed="lisbon" testID="tp" />);
    await ready('tp');
    // Nothing is drawn until the fill has a real size (see `useLayoutSize`).
    expect(screen.queryByTestId('tp-loop-0')).toBeNull();
    await fireEvent(screen.getByTestId('tp'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 200 } },
    });
    paths.forEach((d, i) => expect(screen.getByTestId(`tp-loop-${i}`).props.d).toBe(d));
    expect(screen.queryByTestId(`tp-loop-${paths.length}`)).toBeNull();
  });
});

describe('Stamp', () => {
  it('derives shape, tilt and ink from the seed', () => {
    expect(stampSpec('Lisbon')).toEqual(stampSpec('Lisbon'));
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const spec = stampSpec(`city-${i}`);
      expect(spec.rotation).toBeGreaterThanOrEqual(-8);
      expect(spec.rotation).toBeLessThanOrEqual(8);
      seen.add(`${spec.shape}/${spec.tone}`);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('an explicit tone wins over the seeded one but keeps shape and tilt', () => {
    const seeded = stampSpec('x');
    const forced = stampSpec('x', 'gold');
    expect(forced.tone).toBe('gold');
    expect(forced.shape).toBe(seeded.shape);
    expect(forced.rotation).toBe(seeded.rotation);
  });

  it('renders the same tilt and ink for the same seed', async () => {
    await render(
      <>
        <Stamp testID="s1" seed="Lisbon" title="Lisbon" subtitle="PT" />
        <Stamp testID="s2" seed="Lisbon" title="Lisbon" subtitle="PT" />
      </>,
    );
    await ready('s1');
    const a = flat('s1');
    const b = flat('s2');
    expect(a.transform).toEqual(b.transform);
    expect(a.borderColor).toBe(b.borderColor);
    expect(a.borderColor).toBe(colors[stampSpec('Lisbon').tone]);
    expect(screen.getAllByText('Lisbon')).toHaveLength(2);
    expect(screen.getAllByLabelText('Lisbon, PT')).toHaveLength(2);
  });
});

describe('ProgressRing', () => {
  it('reports progress via accessibility value, clamped', async () => {
    await render(
      <>
        <ProgressRing testID="a" progress={0.42} animate={false} />
        <ProgressRing testID="b" progress={7} animate={false} />
        <ProgressRing testID="c" progress={-1} animate={false} />
        <ProgressRing testID="d" progress={NaN} animate={false} />
      </>,
    );
    await ready('a');
    expect(screen.getByTestId('a').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
    expect(screen.getByTestId('b').props.accessibilityValue.now).toBe(100);
    expect(screen.getByTestId('c').props.accessibilityValue.now).toBe(0);
    expect(screen.getByTestId('d').props.accessibilityValue.now).toBe(0);
  });

  it('sizes the svg and offsets the arc by the unfilled fraction of the circumference', async () => {
    await render(
      <ProgressRing testID="r" progress={0.25} size={100} stroke={10} animate={false} />,
    );
    await ready('r');
    expect(StyleSheet.flatten(screen.getByTestId('r').props.style)).toMatchObject({
      width: 100,
      height: 100,
    });
    const arc = screen.getByTestId('r-arc').props;
    const circumference = 2 * Math.PI * 45;
    expect(arc.r).toBe(45);
    expect(arc.strokeWidth).toBe(10);
    expect(Number(arc.strokeDashoffset)).toBeCloseTo(circumference * 0.75, 3);
  });

  it('renders children in the center and honors a custom gradient', async () => {
    await render(
      <ProgressRing progress={0.5} gradient={gradients.golden} animate={false}>
        <Txt>3</Txt>
      </ProgressRing>,
    );
    await ready('progress-ring');
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('StatTile', () => {
  it('shows the numeral and label, tinted by tone', async () => {
    await render(<StatTile testID="st" value={42} label="Sessions" icon="flame" tone="gold" />);
    await ready('st');
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByLabelText('Sessions: 42')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('42').props.style).color).toBe(colors.gold);
  });
});
