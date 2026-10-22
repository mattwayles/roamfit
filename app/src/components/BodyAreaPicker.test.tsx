/** Awaits after render: React 19 commits asynchronously (see BandChip.test.tsx). */
import React, { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BodyAreaPicker } from './BodyAreaPicker';

const AVAILABLE = ['chest', 'front_delts', 'side_delts', 'rear_delts', 'upper_back', 'lats'];

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <>
      <BodyAreaPicker available={AVAILABLE} selected={selected} onChange={setSelected} />
      {null}
      <Probe value={selected} />
    </>
  );
}
function Probe({ value }: { value: string[] }) {
  return <Text testID="probe">{value.join(',')}</Text>;
}

async function mount(initial: string[] = []) {
  render(<Harness initial={initial} />);
  await waitFor(() => expect(screen.getByTestId('body-area-picker')).toBeTruthy());
}
// The figure is hidden from VoiceOver on purpose, so queries must include hidden elements.
const HID = { hidden: true };
const fillOf = (slug: string) => screen.getByTestId(`body-picker-region-${slug}`, HID).props;

describe('BodyAreaPicker', () => {
  it('toggles every muscle of a region together', async () => {
    await mount();
    await fireEvent.press(screen.getByTestId('body-picker-region-deltoids', HID));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('front_delts,side_delts'),
    );
    await fireEvent.press(screen.getByTestId('body-picker-region-deltoids', HID));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(''));
  });

  it('fills a partly selected region faded and a full one solid', async () => {
    await mount(['front_delts']);
    expect(fillOf('deltoids').fillOpacity).toBe(0.45);
    await fireEvent.press(screen.getByTestId('body-picker-region-deltoids', HID));
    await waitFor(() => expect(fillOf('deltoids').fillOpacity).toBe(1));
    expect(fillOf('chest').fillOpacity).toBe(1);
  });

  it('switches figures and toggles the back-side muscles', async () => {
    await mount();
    expect(screen.queryByTestId('body-picker-region-upper-back', HID)).toBeNull();
    await fireEvent.press(screen.getByTestId('body-picker-side-back'));
    await waitFor(() => expect(screen.getByTestId('body-picker-figure-back', HID)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('body-picker-region-deltoids', HID));
    await fireEvent.press(screen.getByTestId('body-picker-region-upper-back', HID));
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('rear_delts,upper_back,lats'),
    );
  });

  it('has no region for parts that map to no muscle', async () => {
    await mount();
    expect(screen.queryByTestId('body-picker-region-head', HID)).toBeNull();
  });
});
