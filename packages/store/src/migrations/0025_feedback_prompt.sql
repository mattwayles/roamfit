-- 0025_feedback_prompt.sql — "How did that set feel?" can open as a modal over the rest screen
-- instead of sitting inline on it. Default 1 (modal) because the answer is the most useful signal
-- progression gets; turning it off restores the inline control, which is the behaviour every
-- earlier install had.

ALTER TABLE users ADD COLUMN feedback_prompt_enabled INTEGER NOT NULL DEFAULT 1;
