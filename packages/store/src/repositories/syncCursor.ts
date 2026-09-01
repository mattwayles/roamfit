/**
 * §11.3 generic sync-cursor read/write — a small key/value table used by `sync/` to track how
 * far a delta pull or an append-only push has gotten, so a sync pass never has to re-read
 * everything on every run. Local-only bookkeeping; never synced itself.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

export function getSyncCursor(db: Db, name: string): string | null {
  const row = db.select().from(schema.syncCursor).where(eq(schema.syncCursor.name, name)).get();
  return row?.value ?? null;
}

export function setSyncCursor(db: Db, name: string, value: string): void {
  const existing = db
    .select()
    .from(schema.syncCursor)
    .where(eq(schema.syncCursor.name, name))
    .get();
  if (existing) {
    db.update(schema.syncCursor).set({ value }).where(eq(schema.syncCursor.name, name)).run();
  } else {
    db.insert(schema.syncCursor).values({ name, value }).run();
  }
}
