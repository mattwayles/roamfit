/**
 * The driver-agnostic surface: a `Store` is built from an already-open Drizzle sqlite database
 * handle, whichever driver constructed it (see ADR 0003). `packages/store` never imports
 * `better-sqlite3` or `@op-engineering/op-sqlite` outside its own test harness — the caller
 * (node tests here, `app/src/db/` on-device) owns opening the physical file and picking the
 * driver; this package only ever sees the resulting Drizzle handle.
 */
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

/** Both `drizzle-orm/better-sqlite3` and `drizzle-orm/op-sqlite` produce a synchronous
 *  `BaseSQLiteDatabase<'sync', ...>` over this schema — this is the one type the rest of the
 *  package programs against. */
export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

export { schema };
