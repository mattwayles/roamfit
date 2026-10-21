## Track: 43 — iCloud backup
Last updated: 2026-10-20
### Done
- (none yet)
### In progress
- Wave 1, two agents in parallel worktrees:
  - 43a: native module `app/modules/icloud-backup` (Swift, Expo Modules API) + TS wrapper + Jest mock
    + iCloud entitlements in `app/app.json`.
  - 43b: `app/src/db/backup.ts` (snapshot / verify / apply restore) + `closeDb()` in
    `app/src/db/index.ts` + migration 0039 (`users.icloud_backup_enabled`,
    `users.backup_decision_pending`) + store accessors, with tests.
### Next
- 43c: backup scheduler (triggers + guards), Settings "iCloud backup" group, restore UI
  (welcome-screen offer + Settings → Advanced), reschedule notifications after restore.
- 43d: BACKLOG device-pass item; user enables iCloud capability + container on the Apple Developer
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
  Restore or "Start fresh").
- Restore refuses a backup whose `_migrations` contains ids this build doesn't know ("Update
  Wanderlift to restore this backup"). Older backups are migrated forward by the normal `getDb()`.
- After restore: delete `deferred_work` rows of kind `healthkit_write` (Health already syncs across
  the Apple ID — replaying would duplicate workouts); reschedule daily-motivation notifications.
- Backup triggers: session completion; app → background (throttled to once per 15 min); "Back up
  now". Never blocks UI; failures are silent apart from calm Settings copy (never-punish).
