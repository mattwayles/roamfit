import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { daylight, daylightTheme, goldenHour } from '../theme';
import { Enter, Screen, Sheet, Toast, Txt } from './index';
import { flat, inDaylight, ready, WAIT } from './test-utils';

describe('Sheet', () => {
  it('shows children and title when visible, and backdrop press closes', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} title="Pick a marker">
        <Text>Option A</Text>
      </Sheet>,
    );
    await ready('sheet');
    expect(screen.getByText('Pick a marker')).toBeTruthy();
    expect(screen.getByText('Option A')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('non-dismissable ignores the backdrop', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} dismissable={false}>
        <Text>x</Text>
      </Sheet>,
    );
    await ready('sheet');
    await fireEvent.press(screen.getByTestId('sheet-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed, and unmounts after the exit animation', async () => {
    const { rerender } = await render(
      <Sheet visible onClose={() => {}}>
        <Text>Body</Text>
      </Sheet>,
    );
    await ready('sheet');
    await rerender(
      <Sheet visible={false} onClose={() => {}}>
        <Text>Body</Text>
      </Sheet>,
    );
    await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull(), WAIT);
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('opens when visible flips to true', async () => {
    const { rerender } = await render(
      <Sheet visible={false} onClose={() => {}}>
        <Text>Later</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Later')).toBeNull();
    await rerender(
      <Sheet visible onClose={() => {}}>
        <Text>Later</Text>
      </Sheet>,
    );
    await waitFor(() => expect(screen.getByText('Later')).toBeTruthy(), WAIT);
  });
});

describe('Toast', () => {
  it('shows its message, then calls onDone and disappears', async () => {
    const onDone = jest.fn();
    await render(<Toast message="Strong set." triggerKey={1} duration={500} onDone={onDone} />);
    await ready('toast');
    expect(screen.getByText('Strong set.')).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), WAIT);
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull(), WAIT);
  });

  it('renders nothing with no message', async () => {
    await render(<Toast message={null} />);
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('Screen', () => {
  it('paints bg and lays out children and a sticky footer', async () => {
    await render(
      <Screen testID="scr" footer={<Txt>Footer</Txt>}>
        <Txt>Body</Txt>
      </Screen>,
    );
    await ready('scr');
    expect(flat('scr').backgroundColor).toBe(goldenHour.bg);
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
    expect(screen.getByTestId('scr-footer')).toBeTruthy();
  });

  it('scroll mode renders children in a ScrollView', async () => {
    await render(
      <Screen scroll testID="scr">
        <Txt>Scrolling</Txt>
      </Screen>,
    );
    await ready('scr');
    expect(screen.getByText('Scrolling')).toBeTruthy();
  });
});

describe('Enter', () => {
  it('renders its children', async () => {
    await render(
      <Enter testID="e" index={2}>
        <Txt>hello</Txt>
      </Enter>,
    );
    await ready('e');
    expect(screen.getByText('hello')).toBeTruthy();
  });
});

describe('Daylight (overlays)', () => {
  it('Sheet uses the light scrim, a paper panel and the card shadow', async () => {
    await render(
      inDaylight(
        <Sheet visible onClose={() => {}}>
          <Text>Body</Text>
        </Sheet>,
      ),
    );
    await ready('sheet');
    expect(flat('sheet')).toMatchObject({
      backgroundColor: daylight.surface,
      borderColor: daylight.line,
      ...daylightTheme.elevation.card,
    });
    const scrim = screen.getByTestId('sheet-backdrop').parent;
    expect(JSON.stringify(scrim?.props.style)).toContain(daylight.backdrop);
  });

  it('Toast is a Daylight surface3 pill', async () => {
    await render(inDaylight(<Toast message="Strong set." testID="toast" />));
    await ready('toast');
    expect(flat('toast')).toMatchObject({
      backgroundColor: daylight.surface3,
      borderColor: daylight.lineStrong,
    });
  });

  it('Screen paints Daylight paper', async () => {
    await render(
      inDaylight(
        <Screen testID="scr" footer={<Txt>Footer</Txt>}>
          <Txt>Body</Txt>
        </Screen>,
      ),
    );
    await ready('scr');
    expect(flat('scr').backgroundColor).toBe(daylight.bg);
    expect(flat('scr-footer').backgroundColor).toBe(daylight.bg);
    expect(flat('scr-footer').borderTopColor).toBe(daylight.line);
  });
});
