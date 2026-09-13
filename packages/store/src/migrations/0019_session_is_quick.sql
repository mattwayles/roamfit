-- 0019_session_is_quick.sql — §9.5/§14.1.6: Quick Session becomes a persisted fact on the
-- session row, not just a generation-time request flag. The calendar heatmap needs to tell a
-- Quick Session apart from a regular same-focus session, which `focus` alone can't do (Quick
-- Session always requests 'full'). Defaults false, which is correct for every existing row —
-- Quick Session didn't exist as a distinct persisted concept before this.

ALTER TABLE sessions ADD COLUMN is_quick INTEGER NOT NULL DEFAULT 0;
