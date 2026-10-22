import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { getBadge } from '@roamfit/engine';
import { shareBadge } from './badgeShare';

const def = getBadge('sessions_1')!;
const mockedCapture = captureRef as jest.MockedFunction<typeof captureRef>;

describe('shareBadge', () => {
  let share: jest.SpyInstance;
  beforeEach(() => {
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockedCapture.mockClear();
  });
  afterEach(() => share.mockRestore());

  it('captures the card to a PNG and shares it with the text', async () => {
    const ref = { current: {} as View };
    await shareBadge(def, ref);
    expect(mockedCapture).toHaveBeenCalledWith(ref, expect.objectContaining({ format: 'png' }));
    expect(share).toHaveBeenCalledWith({
      url: 'file:///tmp/badge-share.png',
      message: 'Earned the First Steps badge on Wanderlift',
    });
  });

  it('falls back to text alone when the capture fails', async () => {
    mockedCapture.mockRejectedValueOnce(new Error('not laid out'));
    await shareBadge(def, { current: {} as View });
    expect(share).toHaveBeenCalledWith({ message: 'Earned the First Steps badge on Wanderlift' });
  });

  it('shares text alone when the card is not mounted', async () => {
    await shareBadge(def, { current: null });
    expect(mockedCapture).not.toHaveBeenCalled();
    expect(share).toHaveBeenCalledWith({ message: 'Earned the First Steps badge on Wanderlift' });
  });
});
