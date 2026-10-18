-- 0031_entry_transition.sql — Track 37f: the changeover allowance (seconds between exercises) an
-- entry's estimated_sec was computed with, when it is the user's learned value rather than the
-- default 60s. NULL = the default. Kept on the entry so an approval edit re-estimates it with the
-- same allowance the generator used.

ALTER TABLE session_entries ADD COLUMN transition_sec INTEGER;
