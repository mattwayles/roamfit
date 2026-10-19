-- 0036_remove_weekly_target.sql — Track 40: training days per week is gone from the app. It only
-- ever fed the week streak (and its "N weeks on target" motivation lines), which also broke the
-- no-streaks rule, so the target, the streak and the streak's never-used check date are dropped
-- rather than left as dead weight (same call as 0018_remove_enjoyment.sql).

ALTER TABLE users DROP COLUMN weekly_target;
ALTER TABLE rolled_up_stats DROP COLUMN week_streak;
ALTER TABLE rolled_up_stats DROP COLUMN last_week_streak_check_local_date;
