-- 0027_working_band.sql — the band the user last finished an exercise's main working sets on.
-- An exercise with no progression family is prescribed off the library alone, so before this it
-- reset to its lightest authored band every session however the user had changed it. Backfilled
-- from history so a band already moved up in a past session counts straight away: the final
-- completed set of the most recent completed session's main entry for that exercise, using the
-- band the user reported on it, else the band that was prescribed.

ALTER TABLE exercise_state ADD COLUMN working_band TEXT;

UPDATE exercise_state
SET working_band = (
  SELECT COALESCE(set_logs.band_actual, session_entries.band)
  FROM set_logs
  JOIN session_entries ON session_entries.id = set_logs.entry_id
  JOIN sessions ON sessions.id = session_entries.session_id
  WHERE session_entries.exercise_id = exercise_state.exercise_id
    AND session_entries.section = 'main'
    AND sessions.status = 'completed'
    AND set_logs.status = 'completed'
    AND COALESCE(set_logs.band_actual, session_entries.band) IS NOT NULL
  ORDER BY sessions.completed_at DESC, set_logs.set_index DESC
  LIMIT 1
);
