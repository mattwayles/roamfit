-- 0032_onboarding.sql — Track 37h: where the first-launch setup stands. NULL = not in it (an install
-- from before onboarding existed, or any user who has not started it); 'in_progress' = the medical
-- disclaimer was acknowledged and setup is under way, so a relaunch resumes it; 'done' = finished
-- or skipped. Existing installs stay NULL and never see it unless they open it from Settings.

ALTER TABLE users ADD COLUMN onboarding_state TEXT;
