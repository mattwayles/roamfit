-- 0024_session_place.sql — Passport stamps read "Bend, OR, USA" instead of just "Bend": keep the
-- region (state/province, abbreviated when the geocoder abbreviates it) and the ISO country code
-- next to the existing city/country strings. Nullable — sessions pinned before this have neither,
-- and their stamps simply render without them. Strings only, never coordinates.

ALTER TABLE sessions ADD COLUMN region TEXT;
ALTER TABLE sessions ADD COLUMN country_code TEXT;
