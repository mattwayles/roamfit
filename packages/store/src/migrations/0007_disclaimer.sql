-- 0007_disclaimer.sql — Wave 7 §13.3: "a medical disclaimer on
-- first launch and permanently in settings." The settings-screen copy needs no schema (it's just
-- always-rendered text), but first-launch gating needs one persisted bit: has this device's user
-- ever acknowledged it. Defaults false so an existing installed user (already past first launch
-- under an earlier build) sees the disclaimer exactly once on their next open, not on every open
-- thereafter.

ALTER TABLE users ADD COLUMN has_acknowledged_disclaimer INTEGER NOT NULL DEFAULT 0;
