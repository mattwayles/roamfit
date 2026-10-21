-- 0039_icloud_backup.sql — Track 43: iCloud backup. `icloud_backup_enabled` is the Settings switch
-- (ON by default, so every existing row opts in too). `backup_decision_pending` is set at first
-- launch when a backup already exists in iCloud and cleared by Restore or "Start fresh"; while it
-- is set the app never uploads, so an empty fresh install cannot overwrite a real backup.

ALTER TABLE users ADD COLUMN icloud_backup_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN backup_decision_pending INTEGER NOT NULL DEFAULT 0;
