-- 0037_remove_spotify.sql — Spotify is gone from the app (controls could not work offline), so its
-- table and the per-user vibe selection are dropped rather than left as dead weight (same call as
-- 0018_remove_enjoyment.sql).

DROP TABLE spotify_playlists;
ALTER TABLE users DROP COLUMN spotify_vibes;
