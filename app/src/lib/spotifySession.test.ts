/**
 * The Keychain-backed session cache `spotifyRemote.ts` resumes from. Mocks `expo-secure-store`
 * directly (an in-memory `Map` standing in for the Keychain) so this proves the read/write/clear
 * contract and its failure handling without touching a real Keychain, which Jest can't do anyway.
 */
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

import * as SecureStore from 'expo-secure-store';
import {
  loadStoredSpotifySession,
  saveStoredSpotifySession,
  clearStoredSpotifySession,
  type StoredSpotifySession,
} from './spotifySession';

const SESSION: StoredSpotifySession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expirationDate: 1_700_000_000_000,
  scopes: ['app-remote-control', 'user-read-playback-state'],
};

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('loadStoredSpotifySession', () => {
  it('is null when nothing has ever been saved', async () => {
    await expect(loadStoredSpotifySession()).resolves.toBeNull();
  });

  it('round-trips exactly what was saved', async () => {
    await saveStoredSpotifySession(SESSION);
    await expect(loadStoredSpotifySession()).resolves.toEqual(SESSION);
  });

  it('is null rather than throwing on a corrupt entry', async () => {
    await (SecureStore.setItemAsync as jest.Mock)('spotify.session.v1', 'not json at all {{{');
    await expect(loadStoredSpotifySession()).resolves.toBeNull();
  });

  it('is null rather than throwing when the stored value is well-formed JSON but the wrong shape', async () => {
    await (SecureStore.setItemAsync as jest.Mock)('spotify.session.v1', JSON.stringify({ foo: 1 }));
    await expect(loadStoredSpotifySession()).resolves.toBeNull();
  });

  it('is null rather than throwing when the Keychain read itself fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keychain unavailable'),
    );
    await expect(loadStoredSpotifySession()).resolves.toBeNull();
  });
});

describe('saveStoredSpotifySession', () => {
  it('never throws when the underlying write fails', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain full'));
    await expect(saveStoredSpotifySession(SESSION)).resolves.toBeUndefined();
  });
});

describe('clearStoredSpotifySession', () => {
  it('removes a previously saved session', async () => {
    await saveStoredSpotifySession(SESSION);
    await clearStoredSpotifySession();
    await expect(loadStoredSpotifySession()).resolves.toBeNull();
  });

  it('never throws when the underlying delete fails', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('keychain unavailable'),
    );
    await expect(clearStoredSpotifySession()).resolves.toBeUndefined();
  });
});
