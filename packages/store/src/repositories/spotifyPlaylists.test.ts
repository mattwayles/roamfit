/** Spotify favorites + recents (migration 0023): upserts, ordering, and the recents cap. */
import { createTestDb } from '../testHarness';
import {
  listFavoritePlaylists,
  listRecentPlaylists,
  recordPlaylistPlayed,
  setPlaylistFavorite,
} from './spotifyPlaylists';

const pl = (n: number | string, name = `Playlist ${n}`) => ({
  playlistId: `p${n}`,
  uri: `spotify:playlist:p${n}`,
  name,
  owner: 'Someone' as string | null,
});
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute));

function withDb(fn: (db: ReturnType<typeof createTestDb>['db']) => void) {
  const { db, close } = createTestDb();
  try {
    fn(db);
  } finally {
    close();
  }
}

describe('recordPlaylistPlayed', () => {
  it('inserts on first play, then bumps play_count and refreshes name/uri/owner', () => {
    withDb((db) => {
      recordPlaylistPlayed(db, pl(1), at(0));
      recordPlaylistPlayed(
        db,
        { playlistId: 'p1', uri: 'spotify:playlist:new', name: 'Renamed', owner: null },
        at(5),
      );
      expect(listRecentPlaylists(db)).toEqual([
        {
          playlistId: 'p1',
          uri: 'spotify:playlist:new',
          name: 'Renamed',
          owner: null,
          lastPlayedAt: at(5).toISOString(),
          playCount: 2,
          favoritedAt: null,
        },
      ]);
    });
  });

  it('prunes non-favorited rows beyond the 25 most recent, never favorites', () => {
    withDb((db) => {
      setPlaylistFavorite(db, pl('fav'), true, at(0));
      recordPlaylistPlayed(db, pl('fav'), at(1)); // oldest play, but a favorite
      for (let i = 0; i < 30; i++) recordPlaylistPlayed(db, pl(i), at(2 + i));
      const recents = listRecentPlaylists(db, 100);
      expect(recents).toHaveLength(25);
      expect(recents[0].playlistId).toBe('p29');
      expect(recents[24].playlistId).toBe('p5'); // p0-p4 pruned
      expect(listFavoritePlaylists(db).map((r) => r.playlistId)).toEqual(['pfav']);
    });
  });
});

describe('setPlaylistFavorite', () => {
  it('favoriting a never-played playlist creates a favorite that is not a recent', () => {
    withDb((db) => {
      setPlaylistFavorite(db, pl(1), true, at(0));
      const favs = listFavoritePlaylists(db);
      expect(favs).toHaveLength(1);
      expect(favs[0]).toMatchObject({ playCount: 0, lastPlayedAt: null });
      expect(favs[0].favoritedAt).toBe(at(0).toISOString());
      expect(listRecentPlaylists(db)).toEqual([]);
    });
  });

  it('unfavoriting a never-played row deletes it', () => {
    withDb((db) => {
      setPlaylistFavorite(db, pl(1), true, at(0));
      setPlaylistFavorite(db, pl(1), false, at(1));
      expect(listFavoritePlaylists(db)).toEqual([]);
      expect(listRecentPlaylists(db)).toEqual([]);
    });
  });

  it('unfavoriting a played row keeps it as a recent; recents exclude favorites meanwhile', () => {
    withDb((db) => {
      recordPlaylistPlayed(db, pl(1), at(0));
      setPlaylistFavorite(db, pl(1), true, at(1));
      expect(listRecentPlaylists(db)).toEqual([]);
      setPlaylistFavorite(db, pl(1), false, at(2));
      expect(listFavoritePlaylists(db)).toEqual([]);
      expect(listRecentPlaylists(db).map((r) => r.playlistId)).toEqual(['p1']);
    });
  });

  it('unfavoriting an unknown playlist is a no-op', () => {
    withDb((db) => {
      setPlaylistFavorite(db, pl(9), false, at(0));
      expect(listFavoritePlaylists(db)).toEqual([]);
    });
  });
});

describe('ordering', () => {
  it('favorites newest-favorited first; recents newest-played first, honoring limit', () => {
    withDb((db) => {
      setPlaylistFavorite(db, pl(1), true, at(1));
      setPlaylistFavorite(db, pl(2), true, at(3));
      setPlaylistFavorite(db, pl(3), true, at(2));
      expect(listFavoritePlaylists(db).map((r) => r.playlistId)).toEqual(['p2', 'p3', 'p1']);

      recordPlaylistPlayed(db, pl('a'), at(10));
      recordPlaylistPlayed(db, pl('b'), at(12));
      recordPlaylistPlayed(db, pl('c'), at(11));
      recordPlaylistPlayed(db, pl('a'), at(13)); // a replay moves it to the front
      expect(listRecentPlaylists(db).map((r) => r.playlistId)).toEqual(['pa', 'pb', 'pc']);
      expect(listRecentPlaylists(db, 2).map((r) => r.playlistId)).toEqual(['pa', 'pb']);
    });
  });
});
