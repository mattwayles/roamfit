-- 0005_llm_queue_backoff.sql — §11.3 LLM queue: exponential backoff needs a per-row "not
-- eligible before" timestamp. `created_at` alone isn't enough once a job has already failed once
-- (its retry delay is relative to the last attempt, not to when it was first enqueued).
-- NULL means "eligible immediately" (the common case: a freshly-enqueued, never-attempted job).

ALTER TABLE deferred_work ADD COLUMN next_attempt_at TEXT;
