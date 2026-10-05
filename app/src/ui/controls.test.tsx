import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { daybreak, daybreakTheme, midnight, midnightTheme } from '../theme';
import { Chip, IconButton, Pips, SectionHeader, SegmentedBar, Switch } from './index';
import { flat, inDaybreak, ready } from './test-utils';

describe('Chip', () => {
  it('tone = tint background + accent text; selected = solid accent + ink text', async () => {
    await render(
      <>
        <Chip testID="t" label="Warm-up" tone="gold" />
        <Chip testID="s" label="Main" tone="teal" selected />
      </>,
    );
    await ready('t');
    expect(flat('t').backgroundColor).toBe(midnightTheme.tints.gold);
    expect(flat('s').backgroundColor).toBe(midnight.teal);
    expect(screen.getByText('Main')).toBeTruthy();
    const label = screen.getByText('Main').props.style;
    expect(JSON.stringify(label)).toContain(midnight.ink);
  });

  it('presses (with selection haptic) only when given onPress and reports selected state', async () => {
    const tick = jest.spyOn(Haptics, 'selectionAsync');
    const onPress = jest.fn();
    await render(
      <>
        <Chip testID="p" label="Legs" onPress={onPress} selected />
        <Chip testID="q" label="Static" />
      </>,
    );
    await ready('p');
    await fireEvent.press(screen.getByTestId('p'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('p').props.accessibilityState).toEqual({ selected: true });
    tick.mockRestore();
  });
});

describe('IconButton', () => {
  it('is a labelled 44pt circle that presses', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton testID="ib" icon="settings" accessibilityLabel="Settings" onPress={onPress} />,
    );
    await ready('ib');
    expect(flat('ib')).toMatchObject({
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: midnight.surface2,
    });
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('lg is 56pt and can carry a caption', async () => {
    await render(
      <IconButton testID="ib" icon="undo" size="lg" label="Undo" accessibilityLabel="Undo set" />,
    );
    await ready('ib');
    expect(flat('ib').width).toBe(56);
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <IconButton testID="ib" icon="add" accessibilityLabel="Add" onPress={onPress} disabled />,
    );
    await ready('ib');
    await fireEvent.press(screen.getByTestId('ib'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Switch', () => {
  it('toggles via onValueChange with a selection haptic and exposes checked state', async () => {
    const tick = jest.spyOn(Haptics, 'selectionAsync');
    const onValueChange = jest.fn();
    await render(
      <Switch
        testID="sw"
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Sounds"
      />,
    );
    await ready('sw');
    expect(screen.getByTestId('sw').props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(screen.getByTestId('sw'));
    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(tick).toHaveBeenCalledTimes(1);
    tick.mockRestore();
  });

  it('reports on and offers the opposite value when on', async () => {
    const onValueChange = jest.fn();
    await render(<Switch testID="sw" value onValueChange={onValueChange} />);
    await ready('sw');
    expect(screen.getByTestId('sw').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId('sw'));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('does not fire when disabled', async () => {
    const onValueChange = jest.fn();
    await render(<Switch testID="sw" value={false} disabled onValueChange={onValueChange} />);
    await ready('sw');
    await fireEvent.press(screen.getByTestId('sw'));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('SectionHeader', () => {
  it('renders the title and an action that fires', async () => {
    const onAction = jest.fn();
    await render(
      <SectionHeader testID="sh" title="This week" actionLabel="See all" onAction={onAction} />,
    );
    await ready('sh');
    expect(screen.getByText('This week')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sh-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action without a handler', async () => {
    await render(<SectionHeader testID="sh" title="Trails" />);
    await ready('sh');
    expect(screen.queryByTestId('sh-action')).toBeNull();
  });
});

describe('SegmentedBar', () => {
  it('renders one segment per value, filled by fraction, clamped', async () => {
    await render(<SegmentedBar testID="sb" values={[1, 0.5, 0, 3]} activeIndex={1} />);
    await ready('sb');
    expect(flat('sb-fill-0').width).toBe('100%');
    expect(flat('sb-fill-1').width).toBe('50%');
    expect(flat('sb-fill-2').width).toBe('0%');
    expect(flat('sb-fill-3').width).toBe('100%');
    expect(screen.getByTestId('sb').props.accessibilityValue).toEqual({ min: 0, max: 4, now: 2 });
  });

  it('only the active segment glows', async () => {
    await render(
      <SegmentedBar testID="sb" values={[0, 0]} activeIndex={0} color={midnight.periwinkle} />,
    );
    await ready('sb');
    expect(flat('sb-segment-0').shadowColor).toBe(midnight.periwinkle);
    expect(flat('sb-segment-1').shadowColor).toBeUndefined();
  });
});

describe('Pips', () => {
  it('fills `filled` dots and rings the current one', async () => {
    await render(<Pips testID="p" count={4} filled={2} current={2} />);
    await ready('p');
    expect(flat('p-0-dot').backgroundColor).toBe(midnight.teal);
    expect(flat('p-1-dot').backgroundColor).toBe(midnight.teal);
    expect(flat('p-2-dot').backgroundColor).toBe(midnight.surface3);
    expect(screen.getByTestId('p-2-ring')).toBeTruthy();
    expect(screen.queryByTestId('p-1-ring')).toBeNull();
    expect(screen.getByLabelText('2 of 4 sets done')).toBeTruthy();
  });

  it('takes a per-dot flag list for non-contiguous done sets (a skipped set stays empty)', async () => {
    await render(<Pips testID="p" count={3} filled={[false, true, true]} current={0} />);
    await ready('p');
    expect(flat('p-0-dot').backgroundColor).toBe(midnight.surface3);
    expect(flat('p-1-dot').backgroundColor).toBe(midnight.teal);
    expect(flat('p-2-dot').backgroundColor).toBe(midnight.teal);
    expect(screen.getByLabelText('2 of 3 sets done')).toBeTruthy();
  });

  it('a newly filled pip lands filled after a re-render', async () => {
    const { rerender } = await render(<Pips testID="p" count={3} filled={1} current={1} />);
    await ready('p');
    await rerender(<Pips testID="p" count={3} filled={2} current={2} />);
    expect(flat('p-1-dot').backgroundColor).toBe(midnight.teal);
    expect(screen.getByTestId('p-2-ring')).toBeTruthy();
  });
});

describe('Daybreak (controls)', () => {
  it('Chip tone uses the Daybreak tint and deep accent text; selected fills solid with white ink', async () => {
    await render(
      inDaybreak(
        <>
          <Chip label="Upper" tone="teal" testID="t" />
          <Chip label="Picked" tone="teal" selected testID="s" />
          <Chip label="Plain" testID="n" />
        </>,
      ),
    );
    await ready('t');
    expect(flat('t').backgroundColor).toBe(daybreakTheme.tints.teal);
    expect(flat('s').backgroundColor).toBe(daybreak.teal);
    expect(flat('n')).toMatchObject({
      backgroundColor: daybreak.surface2,
      borderColor: daybreak.line,
    });
  });

  it('Switch is a paper thumb on a Daybreak teal track', async () => {
    await render(inDaybreak(<Switch testID="sw" value onValueChange={() => {}} />));
    await ready('sw');
    expect(flat('sw').backgroundColor).toBe(daybreak.surface3);
    expect(flat('sw').borderColor).toBe(daybreak.lineStrong);
  });

  it('IconButton filled disc is a Daybreak surface2', async () => {
    await render(inDaybreak(<IconButton icon="add" accessibilityLabel="More" testID="ib" />));
    await ready('ib');
    expect(flat('ib').backgroundColor).toBe(daybreak.surface2);
  });

  it('SegmentedBar fill defaults to the Daybreak teal and the active glow is the tamed one', async () => {
    await render(inDaybreak(<SegmentedBar values={[1, 0.5]} activeIndex={1} testID="sb" />));
    await ready('sb');
    expect(flat('sb-fill-0').backgroundColor).toBe(daybreak.teal);
    expect(flat('sb-segment-1').shadowColor).toBe(daybreak.teal);
    expect(flat('sb-segment-0').backgroundColor).toBe(daybreak.surface2);
  });

  it('Pips fill with the Daybreak teal over a surface3 track', async () => {
    await render(inDaybreak(<Pips count={2} filled={1} testID="p" />));
    await ready('p');
    expect(flat('p-0-dot').backgroundColor).toBe(daybreak.teal);
    expect(flat('p-1-dot').backgroundColor).toBe(daybreak.surface3);
  });
});
