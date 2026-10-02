/**
 * Spotify playlists the user has played or hearted — per user x playlist (invariant 7's
 * per-user-state shape). One row serves both lists the Spotify sheet shows: a favorite has
 * `favoritedAt`; a recent has `lastPlayedAt` and no favorite. Favorites can exist without a play
 * (hearted straight from a search result), so playing and favoriting are both upserts.
 *
 * Only recents are bounded: `recordPlaylistPlayed` prunes non-favorited rows beyond the
 * `MAX_RECENT_PLAYLISTS` most recently played. Favorites are deliberate keepers and never pruned.
 * Local-only (not synced); name/uri/owner are display data refreshed on each write.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

/** Cap on played-but-not-favorited rows kept. */
export const MAX_RECENT_PLAYLISTS = 25;

export interface SavedSpotifyPlaylist {
  playlistId: string;
  uri: string;
  name: string;
  owner: string | null;
  lastPlayedAt: string | null;
  playCount: number;
  favoritedAt: string | null;
}

export interface PlaylistIdentity {
  playlistId: string;
  uri: string;
  name: string;
  owner: string | null;
}

const t = schema.spotifyPlaylists;

function rowToSaved(row: typeof t.$inferSelect): SavedSpotifyPlaylist {
  return {
    playlistId: row.playlistId,
    uri: row.uri,
    name: row.name,
    owner: row.owner,
    lastPlayedAt: row.lastPlayedAt,
    playCount: row.playCount,
    favoritedAt: row.favoritedAt,
  };
}

function rowKey(playlistId: string) {
  return and(eq(t.userId, USER_ID), eq(t.playlistId, playlistId));
}

function findRow(db: Db, playlistId: string) {
  return db.select().from(t).where(rowKey(playlistId)).all()[0];
}

/** Upserts a play: bumps `playCount`, stamps `lastPlayedAt`, refreshes name/uri/owner, then prunes
 *  non-favorited rows beyond the 25 most recently played. */
export function recordPlaylistPlayed(db: Db, playlist: PlaylistIdentity, now: Date): void {
  const iso = now.toISOString();
  const existing = findRow(db, playlist.playlistId);
  if (existing) {
    db.update(t)
      .set({
        uri: playlist.uri,
        name: playlist.name,
        owner: playlist.owner,
        lastPlayedAt: iso,
        playCount: existing.playCount + 1,
        updatedAt: iso,
      })
      .where(rowKey(playlist.playlistId))
      .run();
  } else {
    db.insert(t)
      .values({
        userId: USER_ID,
        playlistId: playlist.playlistId,
        uri: playlist.uri,
        name: playlist.name,
        owner: playlist.owner,
        lastPlayedAt: iso,
        playCount: 1,
        updatedAt: iso,
      })
      .run();
  }
  pruneRecents(db);
}

/** Hearts or un-hearts a playlist. Favoriting a never-played playlist creates the row. Un-hearting
 *  a row that was never played deletes it (nothing left to show); a played one stays as a recent. */
export function setPlaylistFavorite(
  db: Db,
  playlist: PlaylistIdentity,
  favorite: boolean,
  now: Date,
): void {
  const iso = now.toISOString();
  const existing = findRow(db, playlist.playlistId);
  if (favorite) {
    if (existing) {
      db.update(t)
        .set({
          uri: playlist.uri,
          name: playlist.name,
          owner: playlist.owner,
          favoritedAt: iso,
          updatedAt: iso,
        })
        .where(rowKey(playlist.playlistId))
        .run();
    } else {
      db.insert(t)
        .values({
          userId: USER_ID,
          playlistId: playlist.playlistId,
          uri: playlist.uri,
          name: playlist.name,
          owner: playlist.owner,
          favoritedAt: iso,
          updatedAt: iso,
        })
        .run();
    }
    return;
  }
  if (!existing) return;
  if (existing.playCount === 0) {
    db.delete(t).where(rowKey(playlist.playlistId)).run();
  } else {
    db.update(t)
      .set({ favoritedAt: null, updatedAt: iso })
      .where(rowKey(playlist.playlistId))
      .run();
    // It just became a recent — keep the recents list within its cap.
    pruneRecents(db);
  }
}

/** Newest favorite first. */
export function listFavoritePlaylists(db: Db): SavedSpotifyPlaylist[] {
  return db
    .select()
    .from(t)
    .where(and(eq(t.userId, USER_ID), isNotNull(t.favoritedAt)))
    .orderBy(desc(t.favoritedAt), desc(t.updatedAt))
    .all()
    .map(rowToSaved);
}

/** Played and not favorited, newest play first. (A favorite shows under Favorites, not twice.) */
export function listRecentPlaylists(db: Db, limit = 10): SavedSpotifyPlaylist[] {
  return db
    .select()
    .from(t)
    .where(and(eq(t.userId, USER_ID), isNotNull(t.lastPlayedAt), isNull(t.favoritedAt)))
    .orderBy(desc(t.lastPlayedAt), desc(t.updatedAt))
    .limit(limit)
    .all()
    .map(rowToSaved);
}

function pruneRecents(db: Db): void {
  const recents = db
    .select({ playlistId: t.playlistId })
    .from(t)
    .where(and(eq(t.userId, USER_ID), isNotNull(t.lastPlayedAt), isNull(t.favoritedAt)))
    .orderBy(desc(t.lastPlayedAt), desc(t.updatedAt))
    .all();
  if (recents.length <= MAX_RECENT_PLAYLISTS) return;
  const stale = recents.slice(MAX_RECENT_PLAYLISTS).map((r) => r.playlistId);
  db.delete(t)
    .where(and(eq(t.userId, USER_ID), inArray(t.playlistId, stale)))
    .run();
}
