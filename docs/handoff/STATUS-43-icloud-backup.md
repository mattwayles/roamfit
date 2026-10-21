## Track: 43 — iCloud backup
Last updated: 2026-10-20
### Done
- [x] 43a native module `app/modules/icloud-backup` + TS wrapper + in-memory Jest fake (helpers
  `__reset`, `__setLocalFile`, `__setStored`, `__failNext`… on the mock's default export, wired in
  `app/jest.setup.js`) + entitlements in `app/app.json` — 3ae9c24; evicted-file rotation fix 871d4b0.
  Swift NOT yet compiled (no Xcode build run).
- [x] 43b store layer: migration 0039, `UserRecord.icloudBackupEnabled` / `backupDecisionPending`
  via `usersRepo.getUser/updateUser`, `knownMigrationIds()`, `queuesRepo.deleteDeferredWorkOfKind`
  — 5ea7f7e.
- [x] 43b local layer: `app/src/db/backup.ts` (`createSnapshot`, `inspectSnapshot`,
  `prepareRestoreIncomingPath`, `restoreFromSnapshot` → `RestoreResult`, `cleanupScratchFiles`),
  `backupFiles.ts`, `closeDb` / `getLiveClient` / `reopenDuringRestore` in `db/index.ts` — edce778;
  swap-marker recovery fix 6cd40df.
- [x] 43c migration 0040 `users.icloud_backup_linked` — aeebe5a.
- [x] 43c `app/src/lib/icloudBackup.ts` (`runBackup`, `getBackupStatus`, `checkForExistingBackup`,
  `keepThisPhonesData`, `downloadAndRestore`, `formatBackupTime`); triggers in SummaryScreen
  `handleFinish` and `useBackupOnBackground` (App.tsx `ThemedShell`) — 8b1594c.
- [x] 43c Settings "iCloud backup" group (after Apple Health) — ca42f59.
### In progress
- Agents run sequentially in the main tree (worktrees lack node_modules; concurrent `npm run check`
  is known to hang).
  - 43d: restore UI — welcome-screen offer on a fresh install (sets/clears `backup_decision_pending`),
  Settings → Advanced "Restore from iCloud backup" with confirm, StoreProvider remount with the new
  `Db` after restore, motivation notifications rescheduled.
- 43e: BACKLOG device-pass item; user enables iCloud capability + container on the Apple Developer
  portal and builds to device.
### Decisions / gotchas
- User decisions: backup ON by default; restore offered both on fresh install and from Settings
  (with confirm); backup file hidden from the Files app (no `NSUbiquitousContainers` entry).
- Whole-file snapshot via `VACUUM INTO` (same technique as `legacyDb.ts`), not record sync. Latest
  copy wins; this is backup, not live multi-device sync.
- Local Expo module instead of `react-native-cloud-storage`: that library is string-oriented
  (base64 round-trip for a binary db) and would be a new dependency.
- Container: `iCloud.com.mattwayles.wanderlift`, services `CloudDocuments`. Files live in the
  container root (not `Documents/`) so they stay hidden. `backup.db` + `backup.prev.db` (previous
  copy rotated on each upload).
- Native module contract (both agents code against this):
  - `isAvailable(): Promise<boolean>`
  - `upload(localPath: string): Promise<void>` — rotates `backup.db` → `backup.prev.db`, then copies
    `localPath` to `backup.db` (coordinated write).
  - `download(toPath: string, which?: 'latest' | 'previous'): Promise<boolean>` — false if absent;
    waits for iCloud to download an evicted file.
  - `stat(which?: 'latest' | 'previous'): Promise<{ modifiedAt: number; size: number } | null>`
- NEVER back up an empty db over a real one: no backup until onboarding is complete AND
  `backup_decision_pending` is false (set true at first launch when a backup exists; cleared by
  Restore or "Start fresh"). Backstop against timing races: a device with
  `icloud_backup_linked = false` that finds a remote backup never uploads — it sets pending instead.
  Linked becomes true on first upload, on restore, or on "Keep this phone's data".
- Restore refuses a backup whose `_migrations` contains ids this build doesn't know ("Update
  Wanderlift to restore this backup"). Older backups are migrated forward by the normal `getDb()`.
- After restore: delete `deferred_work` rows of kind `healthkit_write` (Health already syncs across
  the Apple ID — replaying would duplicate workouts); reschedule daily-motivation notifications.
- Backup triggers: session completion; app → background (throttled to once per 15 min); "Back up
  now". Never blocks UI; failures are silent apart from calm Settings copy (never-punish).
