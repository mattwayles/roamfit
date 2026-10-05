-- 0026_entry_feedback.sql — difficulty feedback is asked once per EXERCISE (after its last set)
-- again, so it lives on session_entries.difficulty_feedback, not per set (undoing the shape of
-- 0017). set_logs.difficulty_feedback stays physically but is legacy: nothing writes or reads it
-- after this. Sessions recorded under 0017 carry their answers only there, so fold each entry's
-- per-set answers into its own column with the same worst-case read progression always used
-- (too_hard beats too_easy beats just_right), leaving entries that already have an answer alone.

UPDATE session_entries
SET difficulty_feedback = (
  SELECT CASE
    WHEN SUM(difficulty_feedback = 'too_hard') > 0 THEN 'too_hard'
    WHEN SUM(difficulty_feedback = 'too_easy') > 0 THEN 'too_easy'
    ELSE 'just_right'
  END
  FROM set_logs
  WHERE set_logs.entry_id = session_entries.id AND set_logs.difficulty_feedback IS NOT NULL
)
WHERE difficulty_feedback IS NULL
  AND EXISTS (
    SELECT 1 FROM set_logs
    WHERE set_logs.entry_id = session_entries.id AND set_logs.difficulty_feedback IS NOT NULL
  );
