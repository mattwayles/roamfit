-- 0022_theme_preference.sql — Daylight light mode (docs/DESIGN.md §8): which look the app wears.
-- 'system' follows iOS appearance, 'light' is Daylight, 'dark' is Golden Hour. Default 'system'.
-- Presentation only; nothing in the engine or the sync payload reads it.

ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system';
