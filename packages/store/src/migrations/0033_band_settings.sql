-- 0033_band_settings.sql — Track 37i: which single bands the user owns and whether they stack two
-- for more tension than their heaviest, as JSON {"owned": ["B1",...], "stacking": false}. '{}'
-- means every band owned and no stacking, which is exactly how the app behaved before.

ALTER TABLE users ADD COLUMN band_settings TEXT NOT NULL DEFAULT '{}';
