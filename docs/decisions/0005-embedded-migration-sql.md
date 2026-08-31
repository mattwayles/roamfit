# ADR 0005 — Migration SQL embedded as TS constants, not read from disk at runtime

**Status:** Accepted
**Raised by:** Wave 4 (`4-loop`), first real `expo run:ios` simulator run

## Context

`packages/store/src/migrate.ts` originally read migration files off disk at runtime:
`fs.readdirSync(path.join(__dirname, 'migrations'))` to list them, `fs.readFileSync` to load
each one's SQL. That is fine in node — `packages/store`'s own test suite runs under Jest/node,
and `tsc --noEmit` typechecks the `node:fs`/`node:path` imports without complaint (the package's
own `tsconfig.json` includes `"node"` in `types`).

It is not fine on-device. `app/src/db/index.ts` (Wave 4, ADR 0003/0004) calls `runMigrations` for
real, and the real app is bundled by **Metro**, not compiled by `tsc` and run by `node` — Metro
has no `node:fs`/`node:path` shim and, more fundamentally, no on-device filesystem access to a
"source directory" the way a checked-out repo has one. The first actual `expo run:ios` build in
this environment (booted an "iPhone 17 Pro" simulator, ran `pod install` + `npx expo run:ios`)
built and installed cleanly — the native side (op-sqlite, react-native-screens, the custom sync
driver from ADR 0004) all compiled and linked without issue — but the app red-screened the
instant `HomeScreen` called `getDb()`:

```
Unable to resolve module node:fs from .../packages/store/src/migrate.ts: node:fs could not be
found within the project or in these directories: ...
```

This is exactly the class of bug that only running the real bundler/runtime catches — `tsc` and
Jest both happily accept `node:fs` because they both really do have it. Screenshotted and
recorded before fixing (see `docs/handoff/evidence/`), per this wave's "report honestly" mandate.

## Decision

**Migration SQL is embedded as plain TS string constants** in
`packages/store/src/migrations/data.ts`, exporting `MIGRATIONS: {id, sql}[]` in apply order.
`migrate.ts` no longer imports `node:fs`/`node:path`/`__dirname` at all — `pendingMigrationFiles`
and `runMigrations` work entirely off the in-memory array. This works identically under Jest/node
(the existing test suite) and under Metro/RN (the real app) because there is no longer any
runtime filesystem access to differ between them.

The original `.sql` files (`0001_init.sql`, `0002_muscle_volume.sql`) are **kept**, unchanged, as
the reviewable/diffable source of truth — SQL in a `.sql` file gets real syntax highlighting and
is what a reviewer actually reads for a schema change; a TS template literal is worse for that.
`data.ts`'s constants are hand-copied from them. This is a real, acknowledged duplication (not
generated, no codegen step exists per ADR 0003's original "hand-authored, reviewable" stance) —
recorded here per CLAUDE.md's rule that a deviation from the established pattern needs an ADR,
not a silent workaround.

**`migrate.test.ts` is the guardrail that keeps the duplication honest**: it asserts, for every
entry in `MIGRATIONS`, that a `.sql` file of the same id exists and its content is **byte-for-
byte identical** to the embedded string, and that no `.sql` file in the directory is missing from
`MIGRATIONS`. A hand-edit to one without the other fails this test immediately, not silently at
the next `expo run:ios`.

## Consequences

- `packages/store` has zero `node:fs`/`node:path`/Node-builtin dependency anywhere in its
  runtime code path now (only its own test files still use `node:fs`, which is fine — tests never
  ship in the bundle). This is a strictly stronger position than ADR 0003 asked for.
- Adding a new migration means writing both the `.sql` file (for review) and a matching entry in
  `data.ts` (for real use), by hand, in the same commit — `migrate.test.ts` will fail the build
  otherwise. This is a small tax on an infrequent operation, not a recurring cost.
- If this project ever adds real bundler tooling for raw-text imports (e.g. a Metro asset
  transformer for `.sql`, or a small build step that generates `data.ts` from the `.sql` files),
  that removes the by-hand duplication and this ADR's guardrail test becomes redundant — replace
  it with a codegen-freshness check instead of deleting it outright.
- `app/src/db/index.ts`'s `execMultiStatement` (splitting a multi-statement migration string and
  stripping full-line `--` comments before calling op-sqlite's single-statement `executeSync`) is
  unaffected by this change and still needed — it is about op-sqlite's execution API, not about
  where the SQL text comes from.
