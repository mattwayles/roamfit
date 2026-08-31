-- 0003_lifetime_total_minutes.sql — §14.1.8 lifetime counters need a running lifetime total of
-- actual session minutes. Everything else that column needs (session count, cities, countries,
-- levels gained, best sets) is already derivable from existing rolled-up/milestone data without a
-- new column; total minutes was the one true gap, so this is the smallest schema change that
-- closes it, added incrementally in `recordSessionCompletion` rather than summed from full
-- history on every dashboard read (§11.3).

ALTER TABLE rolled_up_stats ADD COLUMN lifetime_total_minutes REAL NOT NULL DEFAULT 0;
