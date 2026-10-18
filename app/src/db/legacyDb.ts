/**
 * One-time move of the on-device database from its pre-rename filename (`roamfit.sqlite`) to its
 * current one (`wanderlift.sqlite`). op-sqlite has no rename, and this app carries no file-system
 * dependency, so the copy is done in SQL: `VACUUM INTO` writes a consistent snapshot (WAL
 * included) of the old database to the new path.
 *
 * Ordering is the safety property. The legacy file is deleted LAST, and only after the copy is
 * verified to carry the same applied-migration ids — so an interruption at any earlier point
 * leaves the old file untouched and the next launch simply tries again. A launch with no legacy
 * data (new install, or already migrated) opens the legacy name once, finds no `_migrations`
 * table, and deletes the empty stub that `open` just created.
 *
 * Must run BEFORE the new database is opened: `VACUUM INTO` refuses a target that already has
 * content, and opening in WAL mode writes a header.
 */
import { open } from '@op-engineering/op-sqlite';

type Client = ReturnType<typeof open>;

function appliedIds(client: Client): string[] | null {
  const hasTable = client.executeSync(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
  ).rows;
  if (hasTable.length === 0) return null;
  return (client.executeSync('SELECT id FROM _migrations ORDER BY id').rows as { id: string }[]).map(
    (r) => r.id,
  );
}

/** Moves `legacyName` to `newName` if `legacyName` holds data. Throws (leaving the legacy file
 *  intact) if the copy cannot be made or does not verify — e.g. `newName` already has content,
 *  which would mean two diverged databases that must not be silently merged or discarded. */
export function migrateLegacyDb(legacyName: string, newName: string): void {
  const legacy = open({ name: legacyName });
  let ids: string[] | null;
  try {
    ids = appliedIds(legacy);
    if (ids === null) {
      legacy.close();
      legacy.delete();
      return;
    }

    const target = open({ name: newName });
    const targetPath = target.getDbPath();
    target.close();
    // `open` created an empty target file; VACUUM INTO accepts an empty (zero-length) target.
    legacy.executeSync(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);

    const copy = open({ name: newName });
    const copied = appliedIds(copy);
    copy.close();
    if (copied === null || copied.join('\n') !== ids.join('\n')) {
      throw new Error(`Legacy database copy to ${newName} did not verify; ${legacyName} kept.`);
    }
  } catch (e) {
    legacy.close();
    throw e;
  }
  legacy.close();
  legacy.delete();
}
