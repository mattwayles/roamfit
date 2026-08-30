# ADR 0004 — A hand-written synchronous Drizzle driver for op-sqlite

**Status:** Accepted
**Raised by:** Wave 4 (`4-loop`), wiring `app/src/db/` per ADR 0003

## Context

ADR 0003 states that `drizzle-orm/better-sqlite3` and `drizzle-orm/op-sqlite` "produce a
synchronous `BaseSQLiteDatabase<'sync', ...>` over this schema" and that swapping between them
is "a constructor call, not a schema or query rewrite." That is true of the better-sqlite3 driver
(confirmed again in this wave), but checking the actual shipped types at the pinned
`drizzle-orm@0.45.2`:

- `drizzle-orm/better-sqlite3`'s `BetterSQLite3Database extends BaseSQLiteDatabase<'sync', ...>`.
- `drizzle-orm/op-sqlite`'s `OPSQLiteDatabase extends BaseSQLiteDatabase<'async', ...>` — its
  session (`OPSQLiteSession`) is built on `SQLiteAsyncDialect` and every query method returns a
  `Promise`. There is no synchronous Drizzle driver for op-sqlite in this (or any current, as of
  this wave) `drizzle-orm` release — `drizzle-orm/sqlite-proxy` is async-only too.

This is a real gap ADR 0003 did not anticipate, and it matters: `packages/store`'s `Db` type
(`src/db.ts`) is hard-pinned to `BaseSQLiteDatabase<'sync', unknown, typeof schema>`, and every
repository function in that already-verified, independently-tested package calls it
synchronously (`db.select().from(...).all()`, not `await`). Two ways to close the gap:

1. Make `packages/store` async — touch every repository function, every call site in its own
   test suite, and (per this wave's brief) the UI screens that call it. A sweeping change to a
   package explicitly signed off as done, for a driver-adapter reason that has nothing to do
   with its own correctness.
2. Give op-sqlite a synchronous Drizzle adapter of our own, so `packages/store`'s `Db` type and
   every existing call site are untouched.

op-sqlite's own native surface already supports this: `executeSync`/`executeRawSync` on its `DB`
object run a query synchronously against the native binding (JSI, not a bridge round-trip), which
is exactly the primitive `drizzle-orm/better-sqlite3`'s own driver wraps for `better-sqlite3`.

## Decision

**`app/src/db/opSqliteSyncDriver.ts`** is a small (~200-line) synchronous Drizzle SQLite driver
for op-sqlite, written by directly adapting `drizzle-orm/better-sqlite3`'s own `driver.ts` /
`session.ts` (same `SQLiteSyncDialect`, same `SQLiteSession`/`SQLitePreparedQuery` base classes,
same shape of `prepareQuery`/`run`/`all`/`get`/`values`) but backed by op-sqlite's `executeSync`
(keyed rows) and `executeRawSync` (array-mode rows, needed for Drizzle's field-mapped/joined
queries) instead of a `better-sqlite3` prepared `Statement`. Transactions use `SAVEPOINT`/
`RELEASE SAVEPOINT`/`ROLLBACK TO SAVEPOINT` uniformly (op-sqlite's sync surface has no bare
BEGIN/COMMIT wrapper) — safe here because `packages/store` never nests `db.transaction` calls.

`drizzleOpSqlite(client, config)` mirrors `drizzle-orm/better-sqlite3`'s own `drizzle(client,
config)` factory signature, so `app/src/db/index.ts` reads the same shape either driver would.

This file — and `app/src/db/index.ts`, which calls it — is the only place `@op-engineering/
op-sqlite` is imported, per ADR 0003's original intent. `packages/store` is untouched: same `Db`
type, same repository functions, same test harness. The resulting on-device `Db` handle is, from
`packages/store`'s point of view, indistinguishable from the one `createTestDb()` builds for
node tests — same schema, same query builder, same synchronous API — so the "no business-logic
divergence between node-tested code and on-device code" guarantee ADR 0003 relies on still holds;
only the physical row-fetching primitive underneath is new, not written by us, not exercised by
this file beyond passing SQL text and params through to op-sqlite's own `executeSync`.

## Consequences

- `packages/store` needed zero changes for this. Its `npm run check` and existing test suite are
  unaffected.
- `app/src/db/opSqliteSyncDriver.ts` is untested by unit tests (it cannot be — op-sqlite is a
  native binding, only runnable in a compiled RN app on-device or in the simulator, which is
  exactly why ADR 0003 kept `packages/store` driver-agnostic in the first place). Correctness for
  this file rests on it faithfully mirroring `drizzle-orm/better-sqlite3`'s own driver, which
  *is* covered by `packages/store`'s full test suite against the identical schema/query surface.
  A real on-device/simulator smoke test (open a fresh db, run migrations, round-trip one row) is
  still the honest bar for "this actually works," same as ADR 0003 already called for.
- If a future `drizzle-orm` release ships a real synchronous op-sqlite driver, this file should
  be deleted in favor of it — it exists only to fill a gap in the current one.
- If op-sqlite's `executeSync`/`executeRawSync` semantics (row shape, transaction/savepoint
  behavior, `insertId`/`rowsAffected` on write) ever diverge from what this file assumes in a way
  that matters, that is a bug in this file to fix directly — it is application code we own, not a
  vendored dependency.
