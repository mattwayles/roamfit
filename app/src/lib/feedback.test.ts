import { Linking } from 'react-native';
import { buildFeedbackUrl, FEEDBACK_EMAIL, openFeedbackEmail } from './feedback';

describe('feedback email', () => {
  it('addresses the developer inbox with a versioned subject and a device footer', () => {
    const url = buildFeedbackUrl();
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=`)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toMatch(/^Wanderlift feedback \(v/);
    expect(params.get('body')).toMatch(/Wanderlift .*\niOS /);
  });

  it('reports whether a mail app opened', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined);
    expect(await openFeedbackEmail()).toBe(true);
    open.mockRejectedValueOnce(new Error('no mail app'));
    expect(await openFeedbackEmail()).toBe(false);
    open.mockRestore();
  });
});
