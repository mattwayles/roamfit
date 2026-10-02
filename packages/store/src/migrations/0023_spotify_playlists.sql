-- 0023_spotify_playlists.sql — Spotify sheet: remembers which "vibes" (genres/eras) the user wants
-- workout playlists tuned to, and keeps the playlists they have played or hearted so those are
-- one tap away offline instead of re-found through search every time.
--
-- `spotify_vibes` is a JSON array of stable vibe ids (never labels, so a rename can't orphan a
-- stored choice); `'[]'` means "no preference" and the app treats it as the generic search.
--
-- `spotify_playlists` is per user x playlist (invariant 7's per-user-state shape). One row serves
-- both lists: a row with `favorited_at` is a favorite, a row with `last_played_at` and no
-- favorite is a recent. A favorite can exist without ever being played (hearted from a search
-- result), hence both timestamps are nullable. Only recents are pruned (to the 25 most recently
-- played); favorites are the user's deliberate keepers and are never dropped. `name`/`uri`/`owner`
-- are refreshed on every play so a renamed playlist doesn't go stale. Local-only, not synced.

ALTER TABLE users ADD COLUMN spotify_vibes TEXT NOT NULL DEFAULT '[]';

CREATE TABLE spotify_playlists (
  user_id TEXT NOT NULL DEFAULT 'local',
  playlist_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT,
  last_played_at TEXT,
  play_count INTEGER NOT NULL DEFAULT 0,
  favorited_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_spotify_playlists_user_playlist ON spotify_playlists(user_id, playlist_id);
