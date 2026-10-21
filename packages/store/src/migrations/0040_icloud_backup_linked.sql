-- 0040_icloud_backup_linked.sql — Track 43: `icloud_backup_linked` means "this device's data has
-- been reconciled with iCloud" (it has uploaded once, restored, or the user chose to keep this
-- phone's data). While it is false and a backup already exists, the app never uploads, so a fresh
-- install or second device cannot overwrite another phone's data. Existing rows start unlinked.

ALTER TABLE users ADD COLUMN icloud_backup_linked INTEGER NOT NULL DEFAULT 0;
